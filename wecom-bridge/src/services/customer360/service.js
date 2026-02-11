const maintenanceAdapter = require('./ReadOnlyMaintenanceAdapter');
const pg = require('../../pg_client');
const logger = require('../../logger');

/**
 * Customer 360 Aggregator Service
 * 遵循 L3-Sandbox 只读安全级
 */
const Customer360Service = {
    /**
     * 聚合 360 视图
     * @param {string} tyUid 统一身份 ID
     */
    async getCustomerFullView(tyUid) {
        // --- Architect Optimization: Early Exit for U-MOCK to avoid DB coupling ---
        if (process.env.MOCK_MODE === 'true' && tyUid === 'U-MOCK') {
            logger.info(`[Customer360-Mock] Serving early-exit Mock View for ${tyUid}`);
            return this._generateMockView(tyUid);
        }

        try {
            // 1. 获取核心用户信息
            const userRes = await pg.query('SELECT * FROM users WHERE ty_uid = $1', [tyUid]);
            if (userRes.rows.length === 0) {
                // 如果是 Sandbox 模式且找不到用户，尝试返回一个 Mock 用户以便演示
                if (process.env.MOCK_MODE === 'true') {
                    return this._generateMockView(tyUid);
                }
                return null;
            }

            const user = userRes.rows[0];

            // 2. 获取多渠道身份锚点
            const identRes = await pg.query('SELECT provider, external_key, metadata FROM identities WHERE ty_uid = $1', [tyUid]);

            // 3. 提取业务特征 (车牌号)
            const licensePlates = identRes.rows
                .filter(i => i.metadata && i.metadata.license_plate)
                .map(i => i.metadata.license_plate);

            // 4. 获取业务数据 (通过 tyUid 直接查询，替代 licensePlate 锚点)
            const maintenance = await maintenanceAdapter.getMaintenanceByUid(tyUid);


            // 5. 返回标准化视图
            return {
                identity: {
                    ty_uid: user.ty_uid,
                    handle: user.handle,
                    actor_type: user.actor_type,
                    status: user.status
                },
                channels: identRes.rows.map(i => ({ provider: i.provider, key: i.external_key })),
                assets: {
                    license_plates: licensePlates
                },
                maintenance: maintenance,
                _metadata: {
                    generated_at: new Date().toISOString(),
                    security_level: 'L3-Sandbox-ReadOnly'
                }
            };
        } catch (error) {
            // --- Architect Implementation: Graceful Degradation (Stable State) ---
            logger.error(`[Customer360-FATAL] Database linkage lost: ${error.message}`);

            // 如果物理链路断开，退回到“降级稳定态”而非直接 500
            return {
                identity: { ty_uid: tyUid, status: 'error_degraded' },
                maintenance: [],
                _metadata: {
                    generated_at: new Date().toISOString(),
                    security_level: 'L3-Sandbox-Degraded',
                    warning: 'DATABASE_CONNECTION_LOST',
                    message: '系统当前处于降级运行模式，无法加载实时维保数据。'
                }
            };
        }
    },

    /**
     * 为沙箱模式生成 Mock 数据
     */
    _generateMockView(tyUid) {
        return {
            identity: {
                ty_uid: tyUid,
                handle: `U-MOCK-${tyUid.substring(0, 6)}`,
                actor_type: 'customer',
                status: 'mock_active'
            },
            channels: [
                { provider: 'wecom', key: 'mock_external_id' }
            ],
            assets: {
                license_plates: ['京A·88888']
            },
            maintenance: [
                {
                    related_order_id: 'MNT-2026-MOCK',
                    license_plate: '京A·88888',
                    maintain_item: '常规保养 (机油/机滤)',
                    start_time: '2026-01-30',
                    next_maintain_km: 75000
                }
            ],
            _metadata: {
                generated_at: new Date().toISOString(),
                security_level: 'L3-Sandbox-Mock'
            }
        };
    }
};

module.exports = Customer360Service;
