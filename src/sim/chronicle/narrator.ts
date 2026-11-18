import { Rng } from '../../core/rng';
import type { WorldDefs } from '../../data/defs';
import type { ResidentDef } from '../../data/schemas';
import type { ChronicleEntry } from '../state';
import { durationPhrase, familyName, fromFloor, joinNames, nameCase, onFloor, v, type Case } from './russian';

/**
 * Нарратор превращает событие мира в строку хроники.
 * Сейчас — шаблоны; позже можно подставить LLM-нарратор с тем же интерфейсом
 * (он может вернуть черновик сразу и обновить entry.text асинхронно).
 */
export interface Narrator {
  describe(entry: Omit<ChronicleEntry, 'text'>, ctx: NarrateCtx): string;
}

export interface NarrateCtx {
  defs: WorldDefs;
  /** уровень (этаж) квартиры жильца */
  floorOf(id: string): number;
}

type D = ChronicleEntry['data'];

export class TemplateNarrator implements Narrator {
  describe(e: Omit<ChronicleEntry, 'text'>, ctx: NarrateCtx): string {
    // у нарратора свой RNG: смена нарратора не меняет ход симуляции
    const rng = Rng.fromSeed(`narr:${e.id}:${e.t}`);
    const pick = <T,>(arr: T[]) => rng.pick(arr);
    const def = (id: string) => ctx.defs.residentById.get(id)!;
    const n = (id: string, c: Case = 'nom') => nameCase(def(id), c);
    const nf = (id: string) => `${n(id)} ${fromFloor(ctx.floorOf(id))}`;
    const [a, b] = e.actors;
    const d: D = e.data;
    const A = a ? def(a) : (undefined as unknown as ResidentDef);
    const B = b ? def(b) : (undefined as unknown as ResidentDef);
    const s = (x: unknown) => String(x ?? '');

    switch (e.kind) {
      case 'world.start':
        return `Начинается хроника дома на ${ctx.defs.config.address}.`;
      case 'moved-in':
        return `${v(A, 'В дом въехал', 'В дом въехала')} ${n(a)} — квартира ${s(d.apt)}, ${onFloor(ctx.floorOf(a))}.`;
      case 'moved-out':
        return `${s(d.name)} ${s(d.gender) === 'f' ? 'съехала' : 'съехал'} из дома.`;

      case 'visit': {
        const dur = durationPhrase(Number(d.startMin), Number(d.endMin), Number(d.minutes));
        let main: string;
        switch (d.intent) {
          case 'congratulate':
            main = d.gift
              ? `${nf(a)} ${v(A, 'пришёл', 'пришла')} к ${n(b, 'dat')} и ${v(A, 'вручил', 'вручил')}${v(A, '', 'а')} ${v(B, 'ему', 'ей')} ${s(d.gift)}`
              : `${nf(a)} ${v(A, 'пришёл', 'пришла')} к ${n(b, 'dat')} с подарком`;
            break;
          case 'care':
            main = `${n(a)} ${v(A, 'принёс', 'принесла')} ${n(b, 'dat')} ${s(d.gift || 'кастрюльку с чем-то горячим')}`;
            break;
          case 'treat':
            main = `${n(a)} ${v(A, 'отнёс', 'отнесла')} ${n(b, 'dat')} ${s(d.gift || 'тарелку, накрытую полотенцем')}`;
            break;
          case 'apologize':
            main = `${n(a)} ${v(A, 'постучал', 'постучала')} к ${n(b, 'dat')}${d.gift ? ` — с ${s(d.gift)}` : ''}`;
            break;
          default:
            main = pick([
              `${nf(a)} ${v(A, 'зашёл', 'зашла')} к ${n(b, 'dat')}`,
              `${nf(a)} ${v(A, 'заглянул', 'заглянула')} в гости к ${n(b, 'dat')}`,
              `${n(a)} ${ctx.floorOf(a) > ctx.floorOf(b) ? v(A, 'спустился', 'спустилась') : ctx.floorOf(a) < ctx.floorOf(b) ? v(A, 'поднялся', 'поднялась') : v(A, 'заглянул', 'заглянула')} к ${n(b, 'dat')} на чай`,
            ]);
        }
        const extras: string[] = [];
        if (d.dinner) {
          const lunch = d.meal === 'обед';
          extras.push(pick([lunch ? 'вместе пообедали' : 'вместе поужинали', `${n(b)} ${v(B, 'накормил', 'накормила')} ${v(A, 'гостя', 'гостью')} ${lunch ? 'обедом' : 'ужином'}`]));
        }
        if (d.music) extras.push(pick(['из-за двери слышна гитара', 'кто-то играл, кто-то подпевал']));
        if (d.quarrel) {
          return `${main}. Вскоре из-за двери донеслись громкие голоса${d.cause ? `, кажется, ${s(d.cause)}` : ''}, и ${n(a)} ${pick([v(A, 'вышел, хлопнув дверью', 'вышла, хлопнув дверью'), v(A, 'быстро ушёл к себе', 'быстро ушла к себе')])}.`;
        }
        if (d.intent === 'apologize') return `${main}. Дверь открылась не сразу, но потом ${n(a)} ${v(A, 'зашёл', 'зашла')} и ${v(A, 'пробыл', 'пробыла')} там ${dur}. Похоже, помирились.`;
        if (Number(d.minutes) < 12) return `${main}, но надолго не ${v(A, 'задержался', 'задержалась')}.`;
        const talk = pick(['они проговорили', 'они болтали', 'просидели за разговором', 'они пили чай и болтали']);
        return `${main}, ${talk} ${dur}${extras.length ? `, ${joinNames(extras)}` : ''}.`;
      }
      case 'visit.nobody':
        return `${n(a)} ${v(A, 'постучал', 'постучала')} к ${n(b, 'dat')}, но никого не было дома.`;
      case 'visit.refused':
        return pick([
          `${n(a)} ${v(A, 'постучал', 'постучала')} к ${n(b, 'dat')}; дверь приоткрылась на минуту, и ${n(a)} ${v(A, 'ушёл', 'ушла')} ни с чем.`,
          `${n(a)} ${v(A, 'постучал', 'постучала')} к ${n(b, 'dat')}, но дверь так и не открылась, хотя свет внутри горел.`,
        ]);
      case 'visit.unforgiven':
        return `${n(a)} ${v(A, 'постоял', 'постояла')} у двери ${n(b, 'gen')} с чем-то в руках, но ${v(B, 'тот', 'та')} разговаривал${v(B, '', 'а')} через порог недолго — дверь закрылась.`;

      case 'chat': {
        const place = s(d.place);
        const dur = Number(d.minutes) < 12 ? 'перекинулись парой слов' : `${pick(['проболтали', 'обсуждали соседей', 'разговаривали', 'обсуждали новости'])} ${durationPhrase(Number(d.startMin), Number(d.endMin), Number(d.minutes))}`;
        const topic = d.topic ? ` — ${s(d.topic)}` : '';
        if (d.quarrel) return `${n(a)} и ${n(b)} столкнулись ${place} — слово за слово, и уже на весь подъезд${d.cause ? `, кажется, ${s(d.cause)}` : ''}.`;
        return `${n(a)} и ${n(b)} ${pick(['встретились', 'столкнулись', 'пересеклись'])} ${place} и ${dur}${topic}.`;
      }
      case 'greet':
        return `${n(a)} и ${n(b)} ${pick(['кивнули друг другу', 'поздоровались', 'обменялись приветствиями'])} ${s(d.place)}.`;
      case 'avoid':
        return `${n(a)} и ${n(b)} ${s(d.place)} сделали вид, что не заметили друг друга.`;
      case 'elevator':
        return pick([
          `${n(a)} и ${n(b)} ехали вместе в лифте и успели обсудить ${pick(['погоду', 'цены', 'новую лампочку в подъезде', 'соседский ремонт', 'объявление на доске'])}.`,
          `В лифте ${n(a)} ${v(A, 'встретил', 'встретила')} ${n(b, 'acc')}: ${pick(['пара фраз о погоде', 'обсудили, когда починят домофон', 'посмеялись над объявлением про собрание жильцов'])}.`,
        ]);
      case 'elevator.awkward':
        return `${n(a)} и ${n(b)} ехали в лифте молча, глядя в разные стороны.`;

      case 'quarrel':
        return d.place === 'дома'
          ? `Из-за двери ${n(a, 'gen')} и ${n(b, 'gen')} слышны громкие голоса — ругаются${d.cause ? `, кажется, ${s(d.cause)}` : ''}.`
          : `${n(a)} и ${n(b)} ${d.place ? `${s(d.place)} ` : ''}${pick(['поссорились', 'поругались'])}${d.cause ? `, кажется, ${s(d.cause)}` : ''}.`;
      case 'reconcile':
        switch (d.how) {
          case 'encounter':
            return `${n(a)} и ${n(b)} ${s(d.place)} разговорились и, кажется, помирились.`;
          case 'family':
            return pick([`Из квартиры ${n(a, 'gen')} и ${n(b, 'gen')} снова слышен смех — похоже, помирились.`, `${n(a)} и ${n(b)} долго сидели вдвоём на кухне; судя по всему, мир восстановлен.`]);
          default:
            return `${n(a)} и ${n(b)} помирились.`;
        }

      case 'birthday':
        return pick([`${n(a)} с утра ${v(A, 'нарядный', 'нарядная')} и улыбается — похоже, у ${v(A, 'него', 'неё')} праздник.`, `${n(a)} с утра ${v(A, 'принимает', 'принимает')} поздравления по телефону — кажется, день рождения.`]);
      case 'sick':
        return pick([`${n(a)} сегодня не выходит из квартиры; из-за двери слышен кашель.`, `${n(a)} весь день лежит, свет в квартире не гаснет — похоже, ${v(A, 'приболел', 'приболела')}.`]);
      case 'recovered':
        return `${n(a)} снова на ногах — ${v(A, 'вышел', 'вышла')} из квартиры бодрым шагом.`.replace('бодрым шагом', 'как ни в чём не бывало');
      case 'baked':
        return `Из квартиры ${n(a, 'gen')} пахнет ${pick(['пирогом с капустой', 'яблоками и корицей', 'жареными пирожками', 'выпечкой'])} — на весь подъезд.`;
      case 'family-dinner':
        return `${s(d.family)} ${pick(['ужинали вместе', 'собрались за ужином', 'поужинали всей семьёй'])}.`;
      case 'gossip':
        return `${n(a)} и ${n(b)} о чём-то шепчутся, поглядывая в сторону квартиры ${n(s(d.about), 'gen')}.`;
      case 'pet': {
        const pet = s(d.pet);
        const Pet = pet.charAt(0).toUpperCase() + pet.slice(1);
        const owner = n(a, 'gen');
        switch (d.what) {
          case 'window':
            return pick([`${Pet} ${owner} полчаса сидит на подоконнике и следит за голубями во дворе.`, `В окне у ${owner} — ${pet}: смотрит на улицу и подёргивает хвостом.`]);
          case 'lap':
            return `${Pet} устроилась у ${owner} на коленях и, кажется, никуда не собирается.`;
          case 'night-run':
            return `Ночью из квартиры ${owner} слышен топот: ${pet} устроила гонки по коридору.`;
          default:
            return `${Pet} ходит за ${n(a, 'ins')} хвостом и требовательно мяукает.`;
        }
      }
      case 'relative.arrive': {
        const who = relWord(String(d.kind), String(d.gender));
        const age = Number(d.age ?? 40);
        const looks = `${d.gender === 'f' ? 'женщина' : 'мужчина'} лет ${Math.round(age / 5) * 5}`;
        if (d.first)
          return `К ${n(a, 'dat')} приехала ${looks}, очень на неё похожая, — с сумками и тортом. Похоже, ${who}.`.replace('приехала мужчина', 'приехал мужчина').replace('похожая, —', d.gender === 'f' ? 'похожая, —' : 'похожий, —');
        return `К ${n(a, 'dat')} снова ${d.gender === 'f' ? 'приехала' : 'приехал'} ${who}${d.name ? ` (${s(d.name)})` : ''} — с полными сумками.`;
      }
      case 'relative.leave':
        return pick([`Гости ${n(a, 'gen')} уехали ближе к вечеру; ${n(a)} проводила их до остановки взглядом из окна.`, `${relWord(String(d.kind), String(d.gender)).replace(/^./, (c) => c.toUpperCase())} ${n(a, 'gen')} уехала. В квартире снова тихо.`.replace('уехала', d.gender === 'f' ? 'уехала' : 'уехал')]);
      case 'relative.missed':
        return `К ${n(a, 'dat')} кто-то приезжал — постоял у двери, не дождался и уехал.`;
      case 'phone-call': {
        const nm = d.name ? `с какой-то ${s(d.name).replace(/я$/, 'ей').replace(/а$/, 'ой')}` : d.gender === 'f' ? 'с подругой' : 'с кем-то';
        return pick([`Слышно, как ${n(a)} обсуждает по телефону ${nm} ${s(d.topic)}.`, `${n(a)} долго говорит по телефону ${nm} — кажется, про ${s(d.topic)}.`]);
      }
      case 'insomnia':
        return d.onsite ? pick(['Далеко за полночь, а в окошке консьержки всё ещё горит свет.', `Три часа ночи. ${n(a)} сидит в своём окошке, рядом остывший чай.`]) : `Ночь, а у ${n(a, 'gen')} на кухне горит свет.`;
      case 'concierge': {
        const D = n(a);
        const O = n(b, 'dat');
        switch (d.flavor) {
          case 'candy':
            return pick([`${D} вышла из-за стойки и сунула ${O} конфету: «Только маме не говори». И тут же строго велела застегнуть куртку.`, `${D} угостила ${n(b, 'acc')} конфетой — и проворчала вслед, что в её время дети так не носились.`]);
          case 'kid':
            return `${D} проводила ${n(b, 'acc')} взглядом из окошка и покачала головой.`;
          case 'bags':
            return `${D} придержала ${O} дверь: «Опять полные сумки тащите».`;
          case 'late':
            return `«Что-то вы поздно», — заметила из окошка ${D}, когда мимо прошёл${v(B, '', 'а')} ${n(b)}.`;
          case 'wet':
            return `«Ноги вытирайте!» — донеслось из окошка консьержки, когда ${n(b)} ${v(B, 'вошёл', 'вошла')} с мокрой улицы.`;
          case 'cold':
            return `«Шапку бы надели, мороз-то какой», — сказала ${D} вслед ${O}.`;
          case 'chat':
            return `${n(b)} ${v(B, 'задержался', 'задержалась')} у окошка консьержки: ${D} рассказала последние новости подъезда.`;
          default:
            return `${D} кивнула ${O} из своего окошка, не отрываясь от телевизора.`;
        }
      }
      case 'online-voice':
        if (d.game)
          return pick([
            `Из-за стены слышно, как ${n(a)} хохочет в микрофон и кому-то кричит «прикрывай!» — играет по сети с друзьями.`,
            `${n(a)} в наушниках что-то азартно обсуждает с невидимыми собеседниками: идёт сетевая игра.`,
          ]);
        return pick([
          `${n(a)} с кем-то оживлённо созванивается — слышен смех и обрывки разговора про учёбу.`,
          `Из комнаты слышно, как ${n(a)} стучит по клавиатуре и смеётся над чьим-то сообщением.`,
        ]);
      case 'all-nighter':
        return pick([
          `Этой ночью у ${n(a, 'gen')} до четырёх утра мерцал свет монитора.`,
          `Окно ${n(a, 'gen')} голубело от монитора почти до рассвета — ${v(A, 'лёг', 'легла')} только около четырёх.`,
        ]);
      case 'cook.experiment':
        if (b)
          return pick([
            `${n(a)} и ${n(b)} вдвоём колдуют на кухне — по подъезду тянет чем-то пряным. Кажется, ${s(d.dish)}.`,
            `Из квартиры ${n(a, 'gen')} и ${n(b, 'gen')} пахнет так, что соседи принюхиваются: опять эксперимент — похоже, ${s(d.dish)}.`,
          ]);
        return pick([
          `${n(a)} ${v(A, 'устроил', 'устроила')} на кухне эксперимент — по запаху, ${s(d.dish)}.`,
          `С кухни ${n(a, 'gen')} тянет незнакомыми специями: похоже, ${s(d.dish)}.`,
        ]);
      case 'couple.walk':
        return pick([
          `${n(a)} и ${n(b)} ушли гулять вдвоём.`,
          `${n(a)} и ${n(b)} вышли из подъезда — ${d.weekend ? 'выходной, пошли бродить по городу' : 'пройтись перед ужином'}.`,
          `${n(a)} и ${n(b)} отправились пешком куда-то в сторону парка, о чём-то споря и смеясь.`,
        ]);
      case 'couple.film':
        return pick([
          `У ${n(a, 'gen')} и ${n(b, 'gen')} вечер кино: устроились на кровати с ноутбуком.`,
          `${n(a)} и ${n(b)} смотрят ${d.series ? 'сериал — серию за серией' : 'фильм'}, сидя на кровати с ноутбуком.`,
        ]);
      case 'couple.chess':
        return `${n(a)} и ${n(b)} сели за шахматы на кухне${d.win ? ` — ${n(String(d.win))} выигрывает и не скрывает этого` : ''}.`;
      case 'gift':
        return d.out
          ? `${n(a)} ${v(A, 'вернулся', 'вернулась')} домой ${s(d.what)} и прямо в прихожей ${v(A, 'вручил', 'вручила')} это ${n(b, 'dat')}. Без всякого повода.`
          : `${n(a)} ${v(A, 'устроил', 'устроила')} ${n(b, 'dat')} сюрприз: ${s(d.what2)}. Повода, кажется, никакого.`;
      case 'workers.greet': {
        const D = n(a);
        const crew = Number(d.crew ?? 1) > 1;
        const them = crew ? 'им' : 'ему';
        switch (d.when) {
          case 'morning':
            return pick([
              `Пришли мастера на ремонт. ${D} ${d.gesture === 'wave' ? 'помахала' : 'кивнула'} ${them} из своего окошка, ${crew ? 'один махнул' : 'он махнул'} в ответ.`,
              `Около девяти хлопнула дверь подъезда — мастера с ремонта. ${D} подняла глаза от окошка и ${d.gesture === 'wave' ? 'помахала' : 'кивнула'}.`,
              `Мастера снова пришли на ремонт. ${D} проводила их взглядом и кивнула — уже как старым знакомым.`,
            ]);
          case 'lunch':
            return `В обед мастера вышли перекусить. ${D} кивнула ${them} вслед.`;
          case 'back':
            return `Мастера вернулись с обеда; ${D} молча кивнула ${them} из окошка.`;
          default:
            return pick([
              `Мастера ушли до завтра. ${D} кивнула ${them} на прощание.`,
              `Вечером мастера спустились, отряхивая побелку. ${D} махнула ${them} из окошка.`,
            ]);
        }
      }
      case 'first-snow':
        return pick(['Выпал первый снег. Двор за полчаса стал белым.', 'Пошёл первый снег — крупными хлопьями, медленно.', 'Первый снег: на лавочке и качелях белые шапки.']);
      case 'downpour':
        return d.wind ? 'Налетел ветер, хлынул ливень — по двору побежали ручьи.' : pick(['Начался сильный дождь.', 'Над домом разразился ливень.']);
      case 'fog':
        return pick(['Двор утонул в густом тумане — остановку не видно.', 'Утро в молоке: туман такой, что фонарь едва видно.', 'Туман. Деревья во дворе как нарисованные карандашом.']);
      case 'frost':
        return `Ударил мороз: ${d.temp}°. Окна покрылись узорами.`;
      case 'heat':
        return `Жара: +${d.temp}°. Во дворе ни души, все прячутся по квартирам.`;
      case 'snowman':
        return `${n(a)} ${v(A, 'слепил', 'слепила')} во дворе снеговика${d.hat ? ' и ' + v(A, 'надел', 'надела') + ' на него ведро' : ''}.`;
      case 'snowman.melt':
        return `Снеговик, которого ${v(A, 'слепил', 'слепила')} ${n(a)}, растаял.`;
      case 'work.late':
        return `${n(a)} ${v(A, 'задержался', 'задержалась')} на работе.`;
      default:
        return `${e.kind}: ${e.actors.map((x) => n(x)).join(', ')}`;
    }
  }
}

export { familyName };

function relWord(kind: string, gender: string): string {
  const f = gender === 'f';
  switch (kind) {
    case 'child': return f ? 'дочь' : 'сын';
    case 'parent': return f ? 'мать' : 'отец';
    case 'sibling': return f ? 'сестра' : 'брат';
    case 'grandchild': return f ? 'внучка' : 'внук';
    case 'friend': return f ? 'подруга' : 'друг';
    case 'colleague': return 'коллега';
    default: return f ? 'родственница' : 'родственник';
  }
}
