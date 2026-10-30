import { DEAR, GREETINGS, type LanguageCode, type OccasionId } from '../i18n-data';

export type Tone = 'heartfelt' | 'funny' | 'short' | 'poetic';
export const TONES: Tone[] = ['heartfelt', 'funny', 'short', 'poetic'];

export type WishInput = {
  occasion: OccasionId;
  language: LanguageCode;
  tone: Tone;
  recipientName: string;
  relationship?: string;
  senderName?: string;
  detail?: string;
  variant?: number;
};

/** Occasions where celebration language is wrong. */
const SUPPORTIVE: OccasionId[] = ['getwell', 'condolence', 'remembrance'];

/** One warm closing line per language: celebratory, and supportive for get-well/sympathy. */
const CLOSING: Record<LanguageCode, { joy: string; care: string }> = {
  en: { joy: 'Wishing you happiness and many beautiful moments.', care: 'Thinking of you and sending love.' },
  zh: { joy: '祝你幸福快乐，美好时光常伴。', care: '心里一直惦记着你，送上我的关爱。' },
  hi: { joy: 'आपको ढेर सारी खुशियाँ और सुंदर पल मिलें।', care: 'मेरी शुभकामनाएँ और प्यार आपके साथ हैं।' },
  es: { joy: 'Te deseo mucha felicidad y momentos inolvidables.', care: 'Pienso en ti y te envío todo mi cariño.' },
  fr: { joy: 'Je te souhaite beaucoup de bonheur et de beaux moments.', care: 'Je pense à toi et je t’envoie toute mon affection.' },
  ar: { joy: 'أتمنى لك السعادة ولحظات جميلة لا تُنسى.', care: 'أفكر فيك وأرسل لك كل المحبة.' },
  bn: { joy: 'তোমার জীবন আনন্দ আর সুন্দর মুহূর্তে ভরে উঠুক।', care: 'তোমার কথা ভাবছি, অনেক ভালোবাসা রইল।' },
  pt: { joy: 'Desejo-te muita felicidade e momentos lindos.', care: 'Estou pensando em você e mandando todo o meu carinho.' },
  ru: { joy: 'Желаю счастья и множества прекрасных мгновений.', care: 'Думаю о тебе и шлю тебе тепло и любовь.' },
  ur: { joy: 'آپ کو ڈھیروں خوشیاں اور خوبصورت لمحے نصیب ہوں۔', care: 'آپ کو یاد کر رہا ہوں اور دعائیں بھیج رہا ہوں۔' },
  id: { joy: 'Semoga selalu bahagia dan penuh momen indah.', care: 'Aku selalu memikirkanmu dan mengirimkan doa terbaik.' },
  de: { joy: 'Ich wünsche dir viel Glück und wunderschöne Momente.', care: 'Ich denke an dich und schicke dir alle Liebe.' },
  ja: { joy: 'たくさんの幸せと素敵な時間が訪れますように。', care: 'いつもあなたのことを想っています。' },
  mr: { joy: 'तुमचे आयुष्य आनंदाने आणि सुंदर क्षणांनी भरून जावो.', care: 'तुमची आठवण येत आहे, खूप प्रेम आणि शुभेच्छा.' },
  te: { joy: 'మీ జీవితం సంతోషంతో, అందమైన క్షణాలతో నిండాలని కోరుకుంటున్నాను.', care: 'మీ గురించే ఆలోచిస్తున్నాను, నా ప్రేమ మీతో ఉంటుంది.' },
  tr: { joy: 'Sana bol mutluluk ve güzel anlar diliyorum.', care: 'Seni düşünüyorum, tüm sevgimi gönderiyorum.' },
  ta: { joy: 'உங்கள் வாழ்வு மகிழ்ச்சியும் இனிய தருணங்களும் நிறைந்ததாக அமையட்டும்.', care: 'உங்களை நினைத்துக்கொண்டிருக்கிறேன், என் அன்பு எப்போதும் உங்களுடன்.' },
  vi: { joy: 'Chúc bạn thật nhiều hạnh phúc và những khoảnh khắc tuyệt vời.', care: 'Mình luôn nghĩ đến bạn và gửi đến bạn thật nhiều yêu thương.' },
  ko: { joy: '행복과 아름다운 순간이 가득하길 바랍니다.', care: '늘 당신을 생각하며 따뜻한 마음을 전합니다.' },
  it: { joy: 'Ti auguro tanta felicità e momenti bellissimi.', care: 'Ti penso e ti mando tutto il mio affetto.' },
  gu: { joy: 'તમારું જીવન ખુશીઓ અને સુંદર પળોથી ભરાઈ જાય.', care: 'તમને યાદ કરું છું, ખૂબ પ્રેમ અને શુભેચ્છા.' },
  fa: { joy: 'برایت شادی و لحظه‌های زیبای فراوان آرزو می‌کنم.', care: 'به یادت هستم و برایت عشق و دعای خیر می‌فرستم.' },
  pa: { joy: 'ਤੁਹਾਡੀ ਜ਼ਿੰਦਗੀ ਖੁਸ਼ੀਆਂ ਅਤੇ ਸੋਹਣੇ ਪਲਾਂ ਨਾਲ ਭਰੀ ਰਹੇ।', care: 'ਤੁਹਾਨੂੰ ਯਾਦ ਕਰ ਰਿਹਾ ਹਾਂ, ਢੇਰ ਸਾਰਾ ਪਿਆਰ।' },
  sw: { joy: 'Nakutakia furaha tele na nyakati nzuri.', care: 'Ninakufikiria na kukutumia upendo mwingi.' },
  fil: { joy: 'Hangad ko ang iyong kaligayahan at maraming magagandang sandali.', care: 'Iniisip kita at ipinadadala ko ang aking pagmamahal.' },
  kn: { joy: 'ನಿಮ್ಮ ಬದುಕು ಸಂತೋಷ ಮತ್ತು ಸುಂದರ ಕ್ಷಣಗಳಿಂದ ತುಂಬಿರಲಿ.', care: 'ನಿಮ್ಮನ್ನು ನೆನೆಯುತ್ತಿದ್ದೇನೆ, ನನ್ನ ಪ್ರೀತಿ ಸದಾ ನಿಮ್ಮೊಂದಿಗೆ.' },
  or: { joy: 'ଆପଣଙ୍କ ଜୀବନ ଖୁସି ଓ ସୁନ୍ଦର ମୁହୂର୍ତ୍ତରେ ଭରି ରହୁ।', care: 'ଆପଣଙ୍କୁ ମନେ ପକାଉଛି, ଅନେକ ସ୍ନେହ ଓ ଶୁଭେଚ୍ଛା।' },
  ml: { joy: 'നിങ്ങളുടെ ജീവിതം സന്തോഷവും മനോഹര നിമിഷങ്ങളും നിറഞ്ഞതാകട്ടെ.', care: 'നിങ്ങളെ ഓർക്കുന്നു, എന്റെ സ്നേഹം എന്നും കൂടെയുണ്ട്.' },
  as: { joy: 'আপোনাৰ জীৱন আনন্দ আৰু সুন্দৰ মুহূৰ্তেৰে ভৰি পৰক।', care: 'আপোনাক মনত পেলাইছোঁ, অশেষ মৰম আৰু শুভেচ্ছা।' },
  mai: { joy: 'अहाँक जिनगी खुशी आ सुन्दर पलसँ भरल रहए।', care: 'अहाँकेँ मोन पाड़ि रहल छी, बहुत रास स्नेह।' },
  ne: { joy: 'तपाईंको जीवन खुसी र सुन्दर पलहरूले भरियोस्।', care: 'तपाईंलाई सम्झिरहेको छु, धेरै माया र शुभकामना।' },
  kok: { joy: 'तुमचें जिवीत खोशयेन आनी सोबीत खिणांनी भरूं.', care: 'तुमचो उगडास येता, खूब मोग आनी परबी.' }
};

/** English templates per occasion family and tone. {name}, {sender}, {detail} are filled in. */
const EN: Record<string, Record<Tone, string[]>> = {
  birthday: {
    heartfelt: ['Happy birthday, {name}! Thank you for every laugh, every honest word and every late-night call. Here is to your best year yet.', 'Happy birthday, {name}! The world is a little kinder with you in it. I hope today feels as special as you are.'],
    funny: ['Happy birthday, {name}! Don’t worry about getting older — you’re just becoming a classic. Cake is on me, candles are on the fire brigade.', 'Happy birthday, {name}! Another year wiser, and somehow still the best at advice nobody asked for.'],
    short: ['Happy birthday, {name}! Have the most wonderful day.', 'Happy birthday, {name}! So lucky to know you.'],
    poetic: ['Candles glow and wishes rise,\nlaughter bright as summer skies.\nMay this year bring all you dream —\nhappy birthday, {name}.']
  },
  anniversary: {
    heartfelt: ['Happy anniversary, {name}! Here is to the love you share and the beautiful life you keep building together.'],
    funny: ['Happy anniversary, {name}! Still choosing each other — and still arguing about the thermostat. That’s true love.'],
    short: ['Happy anniversary, {name}! Wishing you many more years together.'],
    poetic: ['Two hearts, one road, one shining year,\nwith every step your love grows clear.\nHappy anniversary, {name}.']
  },
  wedding: {
    heartfelt: ['Congratulations, {name}! Wishing you a lifetime of love, laughter and adventures together.'],
    funny: ['Congratulations, {name}! May your love be modern enough to survive the times and old-fashioned enough to last forever.'],
    short: ['Congratulations on your wedding, {name}!'],
    poetic: ['Two stories now become one tale,\nwith love as wind upon the sail.\nCongratulations, {name}.']
  },
  baby: {
    heartfelt: ['Congratulations, {name}! Welcome to the world, little one. Wishing your family endless cuddles and joy.'],
    funny: ['Congratulations, {name}! Sleep is overrated anyway. Welcome to the best adventure of your lives.'],
    short: ['Congratulations on your new arrival, {name}!'],
    poetic: ['Tiny hands and a brand-new start,\na little one to fill your heart.\nCongratulations, {name}.']
  },
  festival: {
    heartfelt: ['{greeting}, {name}! May this festival fill your home with light, love and togetherness.'],
    funny: ['{greeting}, {name}! May your plate stay full and your diet stay forgotten — at least for today.'],
    short: ['{greeting}, {name}!'],
    poetic: ['Lights and laughter, songs that ring,\nmay joy be found in everything.\n{greeting}, {name}.']
  },
  career: {
    heartfelt: ['Congratulations, {name}! All that hard work has paid off. I’m so proud of you.'],
    funny: ['Congratulations, {name}! Now please explain to me what you actually do.'],
    short: ['Congratulations, {name}! Well deserved.'],
    poetic: ['A door swings wide, the path is new,\nthe future waits to welcome you.\nCongratulations, {name}.']
  },
  getwell: {
    heartfelt: ['Get well soon, {name}. Take all the rest you need — I’m thinking of you and here if you need anything.'],
    funny: ['Get well soon, {name}! Doctor’s orders: rest, good food and binge-watching without guilt.'],
    short: ['Get well soon, {name}. Thinking of you.'],
    poetic: ['Rest and heal, take each day slow,\nwarm thoughts are with you as you grow.\nGet well soon, {name}.']
  },
  love: {
    heartfelt: ['{greeting}, {name}! Every day with you is my favourite day. Thank you for being you.'],
    funny: ['{greeting}, {name}! I love you more than coffee — but please don’t make me prove it before 9am.'],
    short: ['{greeting}, {name}! You have my heart.'],
    poetic: ['Roses bloom and stars align,\nmy heart is yours, and yours is mine.\n{greeting}, {name}.']
  },
  family: {
    heartfelt: ['{greeting}, {name}! Thank you for the love, the lessons and the endless support. I’m so lucky to have you.'],
    funny: ['{greeting}, {name}! Thanks for raising such a wonderful human — you’re welcome for all the grey hairs.'],
    short: ['{greeting}, {name}! With all my love.'],
    poetic: ['For every hug and guiding hand,\nfor always helping me to stand —\n{greeting}, {name}.']
  },
  thanks: {
    heartfelt: ['{greeting}, {name}! Your kindness meant more than you know. I’m truly grateful.'],
    funny: ['{greeting}, {name}! You’re officially on my list of favourite people. It’s a short list. You’re at the top.'],
    short: ['{greeting}, {name}!'],
    poetic: ['A kindness given, warmly done,\nlike morning light, like rising sun.\n{greeting}, {name}.']
  },
  friendship: {
    heartfelt: ['{greeting}, {name}! Through every laugh and every hard day, you’ve been there. Here’s to us.'],
    funny: ['{greeting}, {name}! You know too much about me, so I have to keep you forever.'],
    short: ['{greeting}, {name}! Friends forever.'],
    poetic: ['Side by side through sun and rain,\nthrough every joy and every pain.\n{greeting}, {name}.']
  },
  home: {
    heartfelt: ['{greeting}, {name}! May your new home be full of laughter, good food and warm memories.'],
    funny: ['{greeting}, {name}! New house, new rules: I get the comfy chair when I visit.'],
    short: ['{greeting}, {name}! Enjoy your new home.'],
    poetic: ['New walls, new light, a door to share,\nmay love and laughter settle there.\n{greeting}, {name}.']
  },
  milestone: {
    heartfelt: ['{greeting}, {name}! You worked so hard for this and it shows. I’m proud of you.'],
    funny: ['{greeting}, {name}! I always knew you were brilliant — I just didn’t want it going to your head.'],
    short: ['{greeting}, {name}!'],
    poetic: ['Step by step and day by day,\nyou found your path and made your way.\n{greeting}, {name}.']
  },
  farewell: {
    heartfelt: ['{greeting}, {name}! It has been a joy to know you. Wherever you go next, they’re lucky to have you.'],
    funny: ['{greeting}, {name}! Who is going to steal my snacks now? We’ll miss you.'],
    short: ['{greeting}, {name}! You’ll be missed.'],
    poetic: ['A road ahead, a brand-new start,\nyou leave with thanks, you take our heart.\n{greeting}, {name}.']
  },
  spiritual: {
    heartfelt: ['{greeting}, {name}! Wishing you and your loved ones peace, blessings and togetherness.'],
    funny: ['{greeting}, {name}! Wishing you peace, blessings and good company all season long.'],
    short: ['{greeting}, {name}!'],
    poetic: ['May quiet light and hope be near,\nand blessings fill your heart this year.\n{greeting}, {name}.']
  },
  spooky: {
    heartfelt: ['{greeting}, {name}! Wishing you a night of fun, costumes and far too many treats.'],
    funny: ['{greeting}, {name}! Remember: calories don’t count if the sweets are shaped like bats.'],
    short: ['{greeting}, {name}!'],
    poetic: ['Pumpkins grin and lanterns glow,\nthe night is full of fun, you know.\n{greeting}, {name}.']
  },
  pet: {
    heartfelt: ['{greeting}! {name}, thank you for all the cuddles, the muddy paws and the unconditional love.'],
    funny: ['{greeting}! {name}, today you may eat the treat AND the sock. Just this once.'],
    short: ['{greeting}! Lots of love, {name}.'],
    poetic: ['Wagging tail and happy face,\nthe sweetest friend in any place.\n{greeting}! Love you, {name}.']
  },
  remembrance: {
    heartfelt: ['{greeting}. Remembering {name} today with love, and holding you close in my thoughts.'],
    funny: ['{greeting}. Remembering {name} today with love, and holding you close in my thoughts.'],
    short: ['{greeting} — {name}.'],
    poetic: ['Though time moves on and seasons turn,\nthe love remains, the candles burn.\n{greeting} — {name}.']
  },
  condolence: {
    heartfelt: ['Dear {name}, I am so sorry for your loss. Holding you and your family in my thoughts.'],
    funny: ['Dear {name}, I am so sorry for your loss. Holding you and your family in my thoughts.'],
    short: ['Dear {name}, with deepest sympathy.'],
    poetic: ['Though words fall short and hearts are sore,\nlove remembered lives on evermore.\nWith deepest sympathy, {name}.']
  }
};

const FAMILY: Partial<Record<OccasionId, string>> = {
  birthday: 'birthday', anniversary: 'anniversary', wedding: 'wedding', engagement: 'wedding', baby: 'baby', babyshower: 'baby',
  getwell: 'getwell', condolence: 'condolence', remembrance: 'remembrance',
  newjob: 'career', graduation: 'career', promotion: 'career', retirement: 'farewell', farewell: 'farewell',
  goodluck: 'milestone', achievement: 'milestone', valentines: 'love', mothersday: 'family', fathersday: 'family', grandparents: 'family',
  thankyou: 'thanks', teacher: 'thanks', friendship: 'friendship', housewarming: 'home', pet: 'pet',
  ramadan: 'spiritual', vesak: 'spiritual', halloween: 'spooky'
};

function family(o: OccasionId): string {
  return FAMILY[o] ?? 'festival';
}

function clean(s: string) {
  return s.replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
}

export function templateWish(input: WishInput): { text: string; toneUsed: Tone } {
  const name = clean(input.recipientName) || 'friend';
  const greeting = GREETINGS[input.occasion][input.language];
  const detail = input.detail ? clean(input.detail) : '';
  if (input.language === 'en') {
    const options = EN[family(input.occasion)][input.tone];
    let text = options[(input.variant ?? 0) % options.length].replaceAll('{name}', name).replaceAll('{greeting}', greeting);
    if (detail && input.tone !== 'poetic' && input.tone !== 'short') text += ` Still smiling about ${detail}.`;
    if (input.senderName) text += `\n— ${clean(input.senderName)}`;
    return { text, toneUsed: input.tone };
  }
  // Other languages: greeting + name, plus a closing line. Tone variations come from the AI provider.
  const cjk = input.language === 'zh' || input.language === 'ja';
  const comma = input.language === 'ar' || input.language === 'ur' || input.language === 'fa' ? '، ' : cjk ? '，' : ', ';
  const lead = input.occasion === 'condolence' ? `${DEAR[input.language].replace('{n}', name)} — ${greeting}`
    : input.occasion === 'remembrance' ? `${greeting} — ${name}`
    : `${greeting}${comma}${name}${cjk ? '！' : '!'}`;
  const closing = SUPPORTIVE.includes(input.occasion) ? CLOSING[input.language].care : CLOSING[input.language].joy;
  let text = input.tone === 'short' ? lead : `${lead}\n${closing}`;
  if (input.senderName) text += `\n— ${clean(input.senderName)}`;
  return { text, toneUsed: input.tone === 'short' ? 'short' : 'heartfelt' };
}
