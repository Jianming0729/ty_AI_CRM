const processed = new Set();
const inProgress = new Set();

// 每小时清理一次，防止内存无限增长
setInterval(() => {
    processed.clear();
    inProgress.clear();
}, 3600000);

module.exports = {
    /**
     * 原子级检查并加锁，解决并发竞争导致的重复入库
     */
    acquireLock: (msgId) => {
        if (processed.has(msgId) || inProgress.has(msgId)) return false;
        inProgress.add(msgId);
        return true;
    },

    releaseLock: (msgId) => {
        inProgress.delete(msgId);
    },

    markProcessed: (msgId) => {
        inProgress.delete(msgId);
        processed.add(msgId);
    }
};
