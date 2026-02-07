const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] || LOG_LEVELS.INFO;

const logger = {
    debug: (msg) => CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG && console.log(`[DEBUG] ${msg}`),
    info: (msg) => CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO && console.log(`[INFO] ${msg}`),
    warn: (msg) => CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN && console.warn(`[WARN] ${msg}`),
    error: (msg) => CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR && console.error(`[ERROR] ${msg}`)
};

module.exports = logger;
