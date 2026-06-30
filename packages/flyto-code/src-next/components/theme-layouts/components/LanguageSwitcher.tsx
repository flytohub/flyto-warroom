/**
 * LanguageSwitcher — delegates to the shared LocalePicker atom.
 * This wrapper exists solely so Fuse layout imports keep working.
 */
import { LocalePicker } from '@atoms/LocalePicker';

function LanguageSwitcher() {
	return <LocalePicker />;
}

export default LanguageSwitcher;
