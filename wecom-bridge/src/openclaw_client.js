const axios = require('axios');

const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789';
const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

module.exports = {
    /**
     * 将消息发送给 OpenClaw Gateway
     */
    sendToAgent: async (message, sessionId) => {
        console.log(`[Direct-LLM] Sending message: "${message}" for session: ${sessionId}`);

        try {
            // 直接访问 Mock Provider (OpenAI 兼容格式)
            const response = await axios.post(`${gatewayUrl}/v1/chat/completions`, {
                model: "openai/gpt-4o",
                messages: [
                    { role: "user", content: message }
                ],
                user: sessionId
            }, {
                headers: {
                    'Authorization': `Bearer ${gatewayToken}`,
                    'Content-Type': 'application/json'
                }
            });

            // OpenAI 格式返回解析
            if (response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
                return response.data.choices[0].message.content;
            }

            // 兼容之前定义的 Responses 格式
            const output = response.data.output || [];
            const assistantMsg = output.find(o => o.type === 'message' && o.role === 'assistant');
            if (assistantMsg && assistantMsg.content && assistantMsg.content[0]) {
                return assistantMsg.content[0].text;
            }

            return "抱歉，我暂时无法处理您的请求。";
        } catch (error) {
            console.error('[Direct-LLM] Error:', error.message);
            throw error;
        }
    }
};
