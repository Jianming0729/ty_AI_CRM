import json
import re
import os

def parse_kb(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    chunks = []
    
    # 提取 FAQ (按行匹配 “问题” 和 “回答”)
    faq_pattern = re.compile(r'“(.+?)”\n回答：(.+?)(?=\n\n|\n“|$)', re.S)
    faqs = faq_pattern.findall(content)
    for q, a in faqs:
        chunks.append({
            "id": f"faq_{len(chunks):03d}",
            "type": "faq",
            "question": q.strip(),
            "answer": a.strip(),
            "content": f"问：{q.strip()}\n答：{a.strip()}"
        })

    # 提取业务术语 (从 8) 部分提取)
    term_section = re.search(r'8\) 业务术语词汇表.*?意义\n(.*?)(?=\n\n|\n\d|\s*$)', content, re.S)
    if term_section:
        terms = term_section.group(1).strip().split('\n')
        for line in terms:
            parts = line.split('\t')
            if len(parts) >= 2:
                chunks.append({
                    "id": f"term_{len(chunks):03d}",
                    "type": "term",
                    "term": parts[0].strip(),
                    "definition": parts[1].strip(),
                    "content": f"术语：{parts[0].strip()}，定义：{parts[1].strip()}"
                })

    # 提取通用业务规则 (例如 4) 事故处理)
    # 这里简单按段落抓取一些核心规则块
    rules = [
        "事故/故障处理流程：涉及第三方事故应报警留证，联系租车公司，留存事故报告与警局签字凭证。",
        "费用构成：基础租金、异地还车费、超时费、附加驾驶员费、燃油差价费、门店非营业时间服务费、送取车服务费。",
        "取车检查：检查车身划痕、凹陷并拍照，确认油量、里程，签署租赁合同。"
    ]
    for i, rule in enumerate(rules):
        chunks.append({
            "id": f"rule_{i:03d}",
            "type": "rule",
            "content": rule
        })

    return chunks

if __name__ == "__main__":
    kb_path = "/Users/jianmingwang/Desktop/ty_AI_CRM/智能客服知识库内容.txt"
    output_path = "/Users/jianmingwang/Desktop/ty_AI_CRM/wecom-bridge/knowledge_base.json"
    
    if os.path.exists(kb_path):
        data = parse_kb(kb_path)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        print(f"✅ 知识库已提取！共 {len(data)} 个知识块，已保存至 {output_path}")
    else:
        print(f"❌ 找不到文件: {kb_path}")
