/**
 * Intent Processor
 * 遵循《工程治理方案》第 7 条：意图分发治理
 */

const INTENTS = {
    FAQ: 'INTENT_FAQ',           // 政策/流程
    ORDER: 'INTENT_ORDER',       // 订单查询/操作
    TRANSFER: 'INTENT_TRANSFER', // 转人工
    CHITCHAT: 'INTENT_CHITCHAT'  // 闲聊
};

/**
 * 简单关键词意图识别
 * 一期采用规则引擎，二期可升级为 LLM 分类器
 */
const classifyIntent = (text) => {
    const content = text.trim();

    // 1. 转人工判定
    if (content.match(/人|客服|投诉|转接|电话|经理/)) {
        return INTENTS.TRANSFER;
    }

    // 2. 订单/业务判定
    if (content.match(/价格|多少钱|租车|预订|库存|是否有车|订单|续租|退款/)) {
        return INTENTS.ORDER;
    }

    // 3. 闲聊判定 (极简版)
    if (content.match(/你好|你是谁|哈喽|早上好|晚安/)) {
        return INTENTS.CHITCHAT;
    }

    // 默认走 FAQ (即进入 RAG 检索)
    return INTENTS.FAQ;
};

module.exports = {
    INTENTS,
    classifyIntent
};
