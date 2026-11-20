import { L0_UNITS_1_TO_5 } from "./l0-units-1-5";
import { L0_UNITS_6_TO_10 } from "./l0-units-6-10";
import type { LevelDef, PhonicsItem, UnitDef, VocabCard } from "./types";

export * from "./types";

export const CURRICULUM_LEVELS: LevelDef[] = [
  {
    id: "L0",
    nameZh: "L0 启蒙岛 · 开口第一步",
    subtitleZh: "生活高频词 + 26字母自然拼读 + AI 情景剧场",
    ageHintZh: "7岁零基础适用 · 10个完整冒险单元",
    status: "active",
    previewTopics: [
      "你好新朋友",
      "魔法彩虹",
      "生日数数",
      "恐龙之家",
      "阳光水果店",
      "奇妙动物园",
      "动一动身体",
      "小书包",
      "天气预报",
      "神奇玩具箱",
    ],
  },
  {
    id: "L1",
    nameZh: "L1 探索岛 · 日常小会话",
    subtitleZh: "作息时间 + 餐厅点餐 + 逛公园 + 短元音拼读",
    ageHintZh: "学完 L0 后开启（路线规划已就绪）",
    status: "upcoming",
    previewTopics: ["早晚作息", "快乐早餐", "去公园玩", "四季衣服", "交通工具", "我的房间"],
  },
  {
    id: "L2",
    nameZh: "L2 冒险岛 · 故事与表达",
    subtitleZh: "自然科普 + 绘本复述 + 自由情景小剧场",
    ageHintZh: "进阶听说读写综合启蒙",
    status: "upcoming",
    previewTopics: ["太空漫步", "海底世界", "小小厨师", "环游世界", "我的梦想"],
  },
];

export const L0_UNITS: UnitDef[] = [...L0_UNITS_1_TO_5, ...L0_UNITS_6_TO_10];

export function getUnitById(unitId: string): UnitDef | undefined {
  return L0_UNITS.find((u) => u.id === unitId);
}

export interface IndexedVocabCard extends VocabCard {
  unitId: string;
  unitTitleZh: string;
}

export interface IndexedPhonicsItem extends PhonicsItem {
  unitId: string;
  unitTitleZh: string;
}

export function getAllVocab(): IndexedVocabCard[] {
  return L0_UNITS.flatMap((unit) =>
    unit.vocab.map((card) => ({
      ...card,
      unitId: unit.id,
      unitTitleZh: unit.titleZh,
    }))
  );
}

export function getAllPhonics(): IndexedPhonicsItem[] {
  return L0_UNITS.flatMap((unit) =>
    unit.phonics.map((item) => ({
      ...item,
      unitId: unit.id,
      unitTitleZh: unit.titleZh,
    }))
  );
}

export interface PetSnack {
  id: string;
  nameZh: string;
  nameEn: string;
  emoji: string;
  costStars: number;
  hungerGain: number;
  moodGain: number;
  reactionZh: string;
}

export const PET_SNACKS: PetSnack[] = [
  {
    id: "snack-apple",
    nameZh: "脆甜红苹果",
    nameEn: "Red Apple",
    emoji: "🍎",
    costStars: 2,
    hungerGain: 20,
    moodGain: 10,
    reactionZh: "咔嚓咔嚓！红苹果好脆好甜，Dino 吃得超开心！",
  },
  {
    id: "snack-strawberry",
    nameZh: "魔法草莓",
    nameEn: "Magic Berry",
    emoji: "🍓",
    costStars: 3,
    hungerGain: 25,
    moodGain: 18,
    reactionZh: "酸酸甜甜的小草莓，Dino 的尾巴摇成小风扇啦！",
  },
  {
    id: "snack-milk",
    nameZh: "彩虹鲜牛奶",
    nameEn: "Rainbow Milk",
    emoji: "🥛",
    costStars: 4,
    hungerGain: 30,
    moodGain: 22,
    reactionZh: "咕噜咕噜喝光光，补充能量继续冒险吧！",
  },
  {
    id: "snack-cake",
    nameZh: "星星生日蛋糕",
    nameEn: "Star Cake",
    emoji: "🎂",
    costStars: 6,
    hungerGain: 45,
    moodGain: 35,
    reactionZh: "哇！！超级豪华星星大蛋糕，Dino 幸福得跳起舞来！",
  },
];

export interface PetAccessory {
  id: string;
  nameZh: string;
  nameEn: string;
  emoji: string;
  costStars: number;
  descZh: string;
}

export const PET_ACCESSORIES: PetAccessory[] = [
  {
    id: "crown",
    nameZh: "小小金皇冠",
    nameEn: "Golden Crown",
    emoji: "👑",
    costStars: 8,
    descZh: "闪闪发光的小皇冠，英语小王子/小公主专属！",
  },
  {
    id: "wizard_hat",
    nameZh: "星月魔法帽",
    nameEn: "Magic Hat",
    emoji: "🎩",
    costStars: 10,
    descZh: "戴上它仿佛拥有瞬间记住单词的小魔法！",
  },
  {
    id: "scarf",
    nameZh: "暖暖红围巾",
    nameEn: "Cozy Scarf",
    emoji: "🧣",
    costStars: 6,
    descZh: "冬天出门冒险也要暖呼呼的！",
  },
  {
    id: "sunglasses",
    nameZh: "酷炫太阳镜",
    nameEn: "Cool Shades",
    emoji: "🕶️",
    costStars: 7,
    descZh: "戴上小墨镜，变成全岛最酷的小恐龙！",
  },
];

export interface FreeTalkTopic {
  id: string;
  titleZh: string;
  descZh: string;
  emoji: string;
  starterPromptEn: string;
  starterZh: string;
  quickChips: Array<{ en: string; zh: string; icon: string }>;
}

export const FREETALK_TOPICS: FreeTalkTopic[] = [
  {
    id: "ask-word",
    titleZh: "问问单词怎么说",
    descZh: "可以用中文问 Dino：苹果、小狗、太阳用英语怎么说？",
    emoji: "💡",
    starterPromptEn: "Hi friend! Ask me any word! Try asking: 苹果用英语怎么说?",
    starterZh: "你好呀！可以直接问我“苹果用英语怎么说”或者点击下面提示试试哦！",
    quickChips: [
      { en: "苹果用英语怎么说？", zh: "问“苹果”", icon: "🍎" },
      { en: "熊猫用英语怎么说？", zh: "问“熊猫”", icon: "🐼" },
      { en: "彩虹用英语怎么说？", zh: "问“彩虹”", icon: "🌈" },
    ],
  },
  {
    id: "animal-riddle",
    titleZh: "动物猜猜乐",
    descZh: "Dino 出超简单的英文小谜语，你来猜是哪只小动物！",
    emoji: "🐾",
    starterPromptEn: "Let's play a riddle! It is black and white. It loves bamboo. What is it?",
    starterZh: "来玩猜谜吧！它是黑白色的，最爱吃竹子，猜猜它是哪种动物？（英文回答哦）",
    quickChips: [
      { en: "It's a panda!", zh: "是大熊猫！", icon: "🐼" },
      { en: "It's a cat!", zh: "是小猫！", icon: "🐱" },
      { en: "Give me another riddle!", zh: "再猜一个！", icon: "🎲" },
    ],
  },
  {
    id: "mini-story",
    titleZh: "听超短英文小故事",
    descZh: "3 句话的小故事，边听边跟读，轻松磨耳朵！",
    emoji: "📖",
    starterPromptEn: "Story time! One sunny day, a green Dino finds a red apple. Yummy! Want to say red apple?",
    starterZh: "讲故事啦！在一个晴朗的日子，小绿恐龙找到了一颗红苹果，真香甜！想一起读一遍吗？",
    quickChips: [
      { en: "A red apple!", zh: "一个红苹果！", icon: "🍎" },
      { en: "Tell me more!", zh: "继续听故事！", icon: "✨" },
      { en: "I am happy!", zh: "我好开心！", icon: "😄" },
    ],
  },
  {
    id: "daily-chat",
    titleZh: "聊聊今天的心情",
    descZh: "用刚学会的句子告诉 Dino 今天开心吗、喜欢什么颜色！",
    emoji: "💬",
    starterPromptEn: "Hello! How are you today? Are you happy?",
    starterZh: "你好呀！今天心情怎么样？开心吗？",
    quickChips: [
      { en: "I am happy!", zh: "我很开心！", icon: "😊" },
      { en: "I like blue!", zh: "我喜欢蓝色！", icon: "🔵" },
      { en: "It's sunny today!", zh: "今天晴天！", icon: "☀️" },
    ],
  },
];
