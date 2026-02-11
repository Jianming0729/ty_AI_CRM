const pg = require('../../pg_client');
const logger = require('../../logger');

/**
 * ReadOnlyMaintenanceAdapter (Equivalent to BusinessSystemAdapter in V3)
 * 100% 只读适配器，作为与业务系统（Business System）通信的唯一出口。
 * 遵循 v17 治理标准
 */
class ReadOnlyMaintenanceAdapter {
    /**
     * 根据客户统一身份 ID 获取维修/保养记录
     * 遵循 v17 治理标准
     */
    async getMaintenanceByUid(customerUid) {
        if (!customerUid) return [];

        try {
            // --- Architect Implementation: L4-Standard SQL Trace ---
            // 注意：SQL 必须为只读 SELECT，使用 customer_uid 锚点
            const sql = `
                SELECT 
                    related_order_id, 
                    license_plate, 
                    start_time, 
                    maintain_item, 
                    next_maintain_km, 
                    oil_spec,
                    customer_uid
                FROM maintenance_records 
                WHERE customer_uid = $1 
                ORDER BY start_time DESC 
                LIMIT 50
            `;
            const result = await pg.query(sql, [customerUid]);
            return result.rows;
        } catch (error) {
            logger.error(`[Maintenance-Adapter] Failed to fetch data for UID ${customerUid}: ${error.message}`);
            // 降级处理：在沙箱环境下如果表不存在，返回空
            if (error.message.includes('does not exist')) {
                return [];
            }
            throw error;
        }
    }

    /**
     * 安全审计：禁止 POST/PUT/DELETE
     */
    async saveRecord() {
        throw new Error('SECURITY_VIOLATION: MaintenanceAdapter is READ-ONLY (L3-Sandbox)');
    }
}

module.exports = new ReadOnlyMaintenanceAdapter();
