from flask import Flask, request, jsonify
import time
import os
import json

app = Flask(__name__)

@app.route('/v1/chat/completions', methods=['POST'])
@app.route('/v1/responses', methods=['POST'])
def chat():
    data = request.json
    # Try different ways to get the message based on different API styles
    if 'messages' in data:
        user_msg = data['messages'][-1]['content']
    elif 'input' in data:
        last_item = data['input'][-1]
        content = last_item.get('content', '')
        if isinstance(content, list):
            user_msg = "".join([part.get('text', '') for part in content if part.get('type') == 'input_text' or part.get('type') == 'output_text'])
        else:
            user_msg = str(content)
    elif 'prompt' in data:
        user_msg = data['prompt']
    else:
        user_msg = "unknown"
    
    # --- 简易 RAG 检索器 ---
    kb_path = os.path.join(os.path.dirname(__file__), '../app/knowledge_base.json')
    response_text = f"【Mock】我收到了您的问题：{user_msg}。"
    
    if os.path.exists(kb_path):
        with open(kb_path, 'r', encoding='utf-8') as f:
            kb_data = json.load(f)
        
        # 简单关键词匹配 (增强型)
        match_found = False
        user_text = user_msg.lower()
        
        # 建立关键词索引
        for chunk in kb_data:
            content = chunk.get('content', '').lower()
            # 逻辑：如果用户提问的核心关键词在内容中出现，则匹配
            test_keywords = ["取消", "退款", "预订", "流程", "押金", "还车", "事故", "保险", "故障", "怎么办", "异地"]
            hit_keywords = [kw for kw in test_keywords if kw in user_text and kw in content]
            
            if hit_keywords:
                response_text = f"【AI 助手】根据知识库：\n{chunk.get('content')}"
                match_found = True
                break
            
            # 兜底：直接子串包含
            if user_text in content or (len(user_text) > 3 and user_text[:3] in content):
                 response_text = f"【AI 助手】根据知识库：\n{chunk.get('content')}"
                 match_found = True
                 break
        
        if not match_found:
             response_text = "【AI 助手】抱歉，我没能从知识库中找到相关信息。您可以尝试咨询：租车流程、事故处理或押金规则。"
    else:
        response_text += "\n(警告：未找到知识库文件 knowledge_base.json)"
    
    if data.get('stream'):
        def generate():
            resp_id = f"resp_{int(time.time())}"
            created_at = int(time.time())
            model = data.get("model", "mock-model")
            
            # response.created
            yield f"data: {{\"type\": \"response.created\", \"response\": {{\"id\": \"{resp_id}\", \"object\": \"response\", \"created_at\": {created_at}, \"status\": \"in_progress\", \"model\": \"{model}\", \"output\": [], \"usage\": {{\"input_tokens\": 0, \"output_tokens\": 0, \"total_tokens\": 0}}}}}}\n\n"
            
            # response.output_item.added
            item_id = f"msg_{int(time.time())}"
            yield f"data: {{\"type\": \"response.output_item.added\", \"output_index\": 0, \"item\": {{\"type\": \"message\", \"id\": \"{item_id}\", \"role\": \"assistant\", \"content\": [], \"status\": \"in_progress\"}}}}\n\n"
            
            # response.output_text.delta
            yield f"data: {{\"type\": \"response.output_text.delta\", \"item_id\": \"{item_id}\", \"output_index\": 0, \"content_index\": 0, \"delta\": \"{response_text}\"}}\n\n"
            
            # response.output_item.done
            yield f"data: {{\"type\": \"response.output_item.done\", \"output_index\": 0, \"item\": {{\"type\": \"message\", \"id\": \"{item_id}\", \"role\": \"assistant\", \"content\": [{{\"type\": \"output_text\", \"text\": \"{response_text}\"}}], \"status\": \"completed\"}}}}\n\n"
            
            # response.completed
            yield f"data: {{\"type\": \"response.completed\", \"response\": {{\"id\": \"{resp_id}\", \"object\": \"response\", \"created_at\": {created_at}, \"status\": \"completed\", \"model\": \"{model}\", \"output\": [], \"usage\": {{\"input_tokens\": 10, \"output_tokens\": 10, \"total_tokens\": 20}}}}}}\n\n"
            
        return app.response_class(generate(), mimetype='text/event-stream')
    
    return jsonify({
        "id": f"resp_{int(time.time())}",
        "object": "response",
        "created_at": int(time.time()),
        "status": "completed",
        "model": data.get("model", "mock-model"),
        "output": [
            {
                "type": "message",
                "id": f"msg_{int(time.time())}",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": response_text
                    }
                ]
            }
        ],
        "usage": {
            "input_tokens": 10,
            "output_tokens": 10,
            "total_tokens": 20
        }
    })

if __name__ == '__main__':
    print("Mock LLM Provider running on http://0.0.0.0:8000")
    app.run(host='0.0.0.0', port=8000)
