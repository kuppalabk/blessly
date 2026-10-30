import ar from '../locales/ar.json';
import asDict from '../locales/as.json';
import bn from '../locales/bn.json';
import de from '../locales/de.json';
import es from '../locales/es.json';
import fa from '../locales/fa.json';
import fil from '../locales/fil.json';
import fr from '../locales/fr.json';
import gu from '../locales/gu.json';
import hi from '../locales/hi.json';
import id from '../locales/id.json';
import it from '../locales/it.json';
import ja from '../locales/ja.json';
import kn from '../locales/kn.json';
import ko from '../locales/ko.json';
import kok from '../locales/kok.json';
import mai from '../locales/mai.json';
import ml from '../locales/ml.json';
import mr from '../locales/mr.json';
import ne from '../locales/ne.json';
import or from '../locales/or.json';
import pa from '../locales/pa.json';
import pt from '../locales/pt.json';
import ru from '../locales/ru.json';
import sw from '../locales/sw.json';
import ta from '../locales/ta.json';
import te from '../locales/te.json';
import tr from '../locales/tr.json';
import ur from '../locales/ur.json';
import vi from '../locales/vi.json';
import zh from '../locales/zh.json';

const all: Record<string, Record<string, string>> = {
  ar, as: asDict, bn, de, es, fa, fil, fr, gu, hi, id, it, ja, kn, ko, kok, mai, ml, mr, ne, or, pa, pt, ru, sw, ta, te, tr, ur, vi, zh,
};

export function loadDictionary(code: string): Record<string, string> {
  return all[code] ?? {};
}
