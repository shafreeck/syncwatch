import { useI18n } from '@/i18n';

export default function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  const toggle = () => setLang(lang === 'zh' ? 'en' : 'zh');
  return (
    <button
      onClick={toggle}
      title={lang === 'zh' ? '切换为 English' : 'Switch to 中文'}
      className="inline-flex items-center h-7 px-2 rounded-full bg-white/5 ring-1 ring-white/10 text-xs text-white/70 hover:text-white"
    >
      {lang === 'zh' ? '中文' : 'EN'}
    </button>
  );
}

