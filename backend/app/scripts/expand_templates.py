"""Expand slot_templates.json with business, workplace, shopping, travel contexts."""
import json
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "data" / "slot_templates.json"
data = json.loads(path.read_text(encoding="utf-8"))

# New themed slot dictionaries
data["slots"]["BUSINESS_ACTION"] = [
    "开会", "谈判", "签合同", "做报告", "出差",
    "接待客户", "分析数据", "制定计划", "核对账目", "提交方案",
    "拜访合作伙伴", "准备标书", "跟进项目进度", "整理财务报表", "安排商务宴请",
    "讨论预算", "审核合同条款", "撰写商业计划书", "联系供应商", "评估风险",
]

data["slots"]["WORKPLACE_SCENE"] = [
    "在会议室里", "在工位上", "在前台", "在茶水间", "在老板办公室",
    "在培训室", "在开放式办公区", "在公司楼下", "在共享空间", "在视频会议室",
]

data["slots"]["SHOPPING_SCENE"] = [
    "在商场里", "在超市", "在便利店", "在菜市场", "在网上商城",
    "在品牌专卖店", "在折扣店", "在家居城", "在数码产品店", "在书店",
]

data["slots"]["TRAVEL_SCENE"] = [
    "在机场候机厅", "在高铁站", "在酒店大堂", "在旅游景点入口", "在地铁换乘站",
    "在游客中心", "在博物馆门口", "在古镇小巷", "在缆车上", "在海滩度假村",
]

data["slots"]["COMMERCE_TOPIC"] = [
    "谈价格", "讨论交货期", "质量检测", "售后服务", "市场推广",
    "品牌定位", "渠道管理", "库存周转", "客户满意度", "竞争优势",
]

# New paragraph templates — business, shopping, travel, workplace
new_paragraphs = [
    {
        "cn": "[TIME]，[SUBJECT][PLACE]参加了一个重要的商务会议。[BUSINESS_ACTION]的时候，对方提到了{[TARGET]}这个词。[OPINION]，在商业语境中它的意思是{[MEANING]}，对我们理解合同条款很有帮助。",
        "vi": "[TIME], [SUBJECT] tham gia mot cuoc hop kinh doanh quan trong tai [PLACE]. Khi [BUSINESS_ACTION], doi tac co nhac den tu {[TARGET]}. [OPINION], trong ngu canh thuong mai no co nghia la {[MEANING]}, rat huu ich de hieu cac dieu khoan hop dong.",
        "option_vi": "Trong cuoc hop kinh doanh, tu {[TARGET]} mang nghia thuong mai.",
    },
    {
        "cn": "最近公司安排[SUBJECT]去[TRAVEL_SCENE]出差。[TRANSITION]，在[WORKPLACE_SCENE]准备材料的时候，同事提醒说要注意{[TARGET]}的用法，因为在当地{[MEANING]}是非常常见的表达。",
        "vi": "Gan day cong ty sap xep [SUBJECT] di cong tac o [TRAVEL_SCENE]. [TRANSITION], khi chuan bi tai lieu o [WORKPLACE_SCENE], dong nghiep nhac nho phai chu y cach dung cua {[TARGET]}, vi o dia phuong {[MEANING]} la cach dien dat rat pho bien.",
        "option_vi": "Dong nghiep nhac [SUBJECT] chu y cach dung cua {[TARGET]} khi di cong tac.",
    },
    {
        "cn": "[SUBJECT][SHOPPING_SCENE]购物时，看到了一个产品说明上写着{[MEANING]}。[OPINION]，这个词对应的中文就是{[TARGET]}，以后买东西就能看懂了。",
        "vi": "Khi [SUBJECT] mua sam o [SHOPPING_SCENE], nhin thay tren huong dan san pham co viet {[MEANING]}. [OPINION], tu nay trong tieng Trung chinh la {[TARGET]}, sau nay di mua do la co the hieu duoc.",
        "option_vi": "[SUBJECT] hoc duoc tu {[TARGET]} khi di mua sam.",
    },
    {
        "cn": "今天[SUBJECT]在[SHOPPING_SCENE]想买一样东西，但不知道怎么用中文表达。[TRANSITION]想起了之前学过的{[TARGET]}，正好就是{[MEANING]}的意思。店员听了立刻就明白了。",
        "vi": "Hom nay [SUBJECT] o [SHOPPING_SCENE] muon mua mot mon do, nhung khong biet dien dat bang tieng Trung the nao. [TRANSITION] nho ra tu {[TARGET]} da hoc truoc do, dung nghia la {[MEANING]}. Nhan vien nghe xong lien hieu ngay.",
        "option_vi": "[SUBJECT] dung tu {[TARGET]} de giao tiep khi mua sam.",
    },
    {
        "cn": "[SUBJECT]在[WORKPLACE_SCENE]和同事[GROUP_ACTIVITY]。[TRANSITION]，一位资深同事分享了经验，特别强调了{[TARGET]}在工作沟通中的重要性，它传达的是{[MEANING]}的含义。",
        "vi": "[SUBJECT] o [WORKPLACE_SCENE] cung dong nghiep [GROUP_ACTIVITY]. [TRANSITION], mot dong nghiep ky cuu chia se kinh nghiem, dac biet nhan manh tam quan trong cua {[TARGET]} trong giao tiep cong viec, no truyen tai y nghia {[MEANING]}.",
        "option_vi": "Dong nghiep ky cuu nhan manh tam quan trong cua tu {[TARGET]} trong cong viec.",
    },
    {
        "cn": "[TIME]，[SUBJECT]来到了[TRAVEL_SCENE]。[EMOTION]，因为在这里听到了当地人很自然地使用{[TARGET]}这个词，意思是{[MEANING]}。[TRANSITION]，真希望以后也能用得这么地道。",
        "vi": "[TIME], [SUBJECT] den [TRAVEL_SCENE]. [EMOTION], vi o day nghe thay nguoi dia phuong rat tu nhien su dung tu {[TARGET]}, nghia la {[MEANING]}. [TRANSITION], that mong sau nay cung co the dung chuan nhu vay.",
        "option_vi": "[SUBJECT] nghe nguoi ban dia dung tu {[TARGET]} khi di du lich.",
    },
    {
        "cn": "会议中，[SUBJECT]需要用中文做[BUSINESS_ACTION]。[TRANSITION]，想到了可以用{[TARGET]}来表达{[MEANING]}的意思，果然对方一听就懂了要点。",
        "vi": "Trong cuoc hop, [SUBJECT] can dung tieng Trung de [BUSINESS_ACTION]. [TRANSITION], nghi ra co the dung {[TARGET]} de dien dat y {[MEANING]}, qua nhien doi phuong vua nghe da hieu y chinh.",
        "option_vi": "[SUBJECT] dung tu {[TARGET]} trong cuoc hop kinh doanh.",
    },
]
data["paragraph_templates"].extend(new_paragraphs)

# New dialogue templates — workplace, shopping, travel, business
new_dialogues = [
    {
        "cn": "A：你在[WORKPLACE_SCENE]做什么呢？\nB：我在准备明天[BUSINESS_ACTION]的资料。\nA：有什么重点吗？\nB：有一个关键词{[TARGET]}，意思是{[MEANING]}，要重点向客户解释。",
        "vi": "A: Ban dang lam gi o [WORKPLACE_SCENE] the?\nB: Toi dang chuan bi tai lieu cho [BUSINESS_ACTION] ngay mai.\nA: Co diem gi quan trong khong?\nB: Co mot tu khoa {[TARGET]}, nghia la {[MEANING]}, can giai thich ky cho khach hang.",
        "option_vi": "B can giai thich tu {[TARGET]} cho khach hang trong buoi hop.",
    },
    {
        "cn": "A：欢迎光临！您在找什么？\nB：我在找{[TARGET]}，就是{[MEANING]}那种东西。\nA：好的，请跟我来。\nB：谢谢你用中文跟我确认了这个词，我更自信了。",
        "vi": "A: Xin chao quy khach! Ban dang tim gi a?\nB: Toi dang tim {[TARGET]}, chinh la loai {[MEANING]} do.\nA: Vang, moi di theo toi.\nB: Cam on ban da xac nhan tu nay bang tieng Trung voi toi, toi tu tin hon roi.",
        "option_vi": "B tu tin dung tu {[TARGET]} khi mua sam.",
    },
    {
        "cn": "A：你刚从[TRAVEL_SCENE]回来吗？好玩吗？\nB：很好玩！我还学了一个很有用的词。\nA：是什么？\nB：{[TARGET]}，当地人经常用，意思大概是{[MEANING]}。",
        "vi": "A: Ban vua tu [TRAVEL_SCENE] ve a? Co vui khong?\nB: Rat vui! Toi con hoc duoc mot tu rat huu ich.\nA: La tu gi?\nB: {[TARGET]}, nguoi dia phuong hay dung, y nghia dai khai la {[MEANING]}.",
        "option_vi": "B hoc duoc tu {[TARGET]} tu nguoi dia phuong khi di du lich.",
    },
    {
        "cn": "A：[BUSINESS_ACTION]进行得怎么样？\nB：还行，不过有个术语需要确认。\nA：什么术语？\nB：{[TARGET]}，对方一直在强调，意思是{[MEANING]}，看来很关键。",
        "vi": "A: [BUSINESS_ACTION] tien trien the nao roi?\nB: Cung duoc, nhung co mot thuat ngu can xac nhan.\nA: Thuat ngu gi?\nB: {[TARGET]}, doi tac cu nhan manh mai, nghia la {[MEANING]}, xem ra rat quan trong.",
        "option_vi": "B phat hien tu {[TARGET]} la thuat ngu then chot trong dam phan.",
    },
]
data["dialogue_templates"].extend(new_dialogues)

path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Done. {len(data['paragraph_templates'])} paragraphs + {len(data['dialogue_templates'])} dialogues")
print(f"Slot categories: {len(data['slots'])}")
for k in ["BUSINESS_ACTION", "WORKPLACE_SCENE", "SHOPPING_SCENE", "TRAVEL_SCENE", "COMMERCE_TOPIC"]:
    print(f"  {k}: {len(data['slots'][k])} values")
