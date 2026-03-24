import dayjs from 'dayjs';
import weekday from 'dayjs/plugin/weekday';
import localeData from 'dayjs/plugin/localeData';
import 'dayjs/locale/ko';

// dayjs 플러그인 설정
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.locale('ko');

export default dayjs;
