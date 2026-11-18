import { Rng } from '../../core/rng';
import type { WorldDefs } from '../../data/defs';
import type { ResidentDef } from '../../data/schemas';
import type { ChronicleEntry } from '../state';
import { durationPhrase, familyName, fromFloor, joinNames, nameCase, onFloor, v, years, type Case } from './russian';

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
      case 'world.start': {
        const names = ctx.defs.residents.map((r) => r.name.short ?? r.name.first);
        return names.length
          ? `Начинается хроника дома на ${ctx.defs.config.address}. Здесь живут: ${joinNames(names)}.`
          : `Начинается хроника дома на ${ctx.defs.config.address}. Дом пока пуст.`;
      }
      case 'moved-in':
        return `${v(A, 'В дом въехал', 'В дом въехала')} ${n(a)} — квартира ${s(d.apt)}, ${onFloor(ctx.floorOf(a))}.`;
      case 'moved-out':
        return `${s(d.name)} ${s(d.gender) === 'f' ? 'съехала' : 'съехал'} из дома.`;

      case 'visit': {
        const dur = durationPhrase(Number(d.startMin), Number(d.endMin), Number(d.minutes));
        let main: string;
        switch (d.intent) {
          case 'congratulate':
            main = `${nf(a)} ${v(A, 'зашёл', 'зашла')} поздравить ${n(b, 'acc')} с днём рождения${d.gift ? ` и ${v(A, 'принёс', 'принесла')} ${s(d.gift)}` : ''}`;
            break;
          case 'care':
            main = `${n(a)} ${v(A, 'навестил', 'навестила')} ${v(B, 'заболевшего', 'заболевшую')} ${n(b, 'acc')} и ${v(A, 'принёс', 'принесла')} ${s(d.gift || 'горячего бульона')}`;
            break;
          case 'treat':
            main = `${n(a)} ${v(A, 'отнёс', 'отнесла')} ${n(b, 'dat')} ${s(d.gift || 'кусок пирога')}`;
            break;
          case 'apologize':
            main = `${n(a)} ${v(A, 'пришёл', 'пришла')} к ${n(b, 'dat')} мириться${d.gift ? ` с ${s(d.gift)}` : ''}`;
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
        if (d.music) extras.push(pick(['слушали, как играет хозяин', 'пели под гитару']));
        if (d.quarrel) {
          return `${main}, но разговор не задался: ${v(A, 'поссорился', 'поссорилась')} с ${n(b, 'ins')} ${s(d.cause)} и ${pick([v(A, 'ушёл, хлопнув дверью', 'ушла, хлопнув дверью'), v(A, 'ушёл домой раньше', 'ушла домой раньше')])}.`;
        }
        if (d.intent === 'apologize') return `${main} — и они помирились. ${pick(['Проговорили', 'Просидели'])} ${dur}.`;
        if (Number(d.minutes) < 12) return `${main}, но надолго не ${v(A, 'задержался', 'задержалась')}.`;
        const talk = pick(['они проговорили', 'они болтали', 'просидели за разговором', 'они пили чай и болтали']);
        return `${main}, ${talk} ${dur}${extras.length ? `, ${joinNames(extras)}` : ''}.`;
      }
      case 'visit.nobody':
        return `${n(a)} ${v(A, 'постучал', 'постучала')} к ${n(b, 'dat')}, но никого не было дома.`;
      case 'visit.refused':
        return pick([
          `${n(a)} ${v(A, 'зашёл', 'зашла')} к ${n(b, 'dat')}, но ${n(b)} ${v(B, 'сказал', 'сказала')}, что ${v(B, 'занят', 'занята')}.`,
          `${n(b)} не ${v(B, 'открыл', 'открыла')} ${n(a, 'dat')} дверь.`,
        ]);
      case 'visit.unforgiven':
        return `${n(a)} ${v(A, 'пришёл', 'пришла')} к ${n(b, 'dat')} мириться, но ${n(b)} ещё ${v(B, 'не готов', 'не готова')} разговаривать.`;

      case 'chat': {
        const place = s(d.place);
        const dur = Number(d.minutes) < 12 ? 'перекинулись парой слов' : `${pick(['проболтали', 'обсуждали соседей', 'разговаривали', 'обсуждали новости'])} ${durationPhrase(Number(d.startMin), Number(d.endMin), Number(d.minutes))}`;
        const topic = d.topic ? ` — ${s(d.topic)}` : '';
        if (d.quarrel) return `${n(a)} и ${n(b)} столкнулись ${place} и поругались ${s(d.cause)}.`;
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
        return `${n(a)} и ${n(b)} ${d.place ? `${s(d.place)} ` : ''}${pick(['поссорились', 'поругались', 'разругались'])} ${s(d.cause)}.`;
      case 'reconcile':
        switch (d.how) {
          case 'encounter':
            return `${n(a)} и ${n(b)} ${s(d.place)} разговорились и, кажется, помирились.`;
          case 'family':
            return `${n(a)} и ${n(b)} помирились ${pick([e.t % 86400 >= 0 && Number(d.hour ?? 20) >= 17 ? 'за вечерним чаем' : 'за чаем на кухне', 'после долгого разговора на кухне', 'и долго смеялись над тем, из-за чего ссорились'])}.`;
          default:
            return `${n(a)} и ${n(b)} помирились.`;
        }

      case 'birthday':
        return `У ${n(a, 'gen')} день рождения — ${v(A, 'ему', 'ей')} ${years(Number(d.age))}.`;
      case 'sick':
        return `${n(a)} ${v(A, 'заболел', 'заболела')}: ${pick(['температура', 'простуда', 'насморк и кашель', 'сильная слабость'])}, ${v(A, 'остался', 'осталась')} дома.`;
      case 'recovered':
        return `${n(a)} ${v(A, 'поправился', 'поправилась')}.`;
      case 'baked':
        return `${n(a)} ${v(A, 'испёк', 'испекла')} ${pick(['пирог с капустой', 'яблочный пирог', 'пирожки', 'шарлотку'])} — запах на весь подъезд.`;
      case 'family-dinner':
        return `${s(d.family)} ${pick(['ужинали вместе', 'собрались за ужином', 'поужинали всей семьёй'])}.`;
      case 'gossip':
        return `${n(a)} ${v(A, 'рассказал', 'рассказала')} ${n(b, 'dat')} ${pick(['последние новости', 'кое-что интересное', 'по секрету кое-что'])} про ${n(s(d.about), 'acc')}.`;
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
