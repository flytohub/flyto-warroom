import useThemeMediaQuery from '@components/adapters/useThemeMediaQuery';
import NavbarToggleFab from 'src/components/theme-layouts/components/navbar/NavbarToggleFab';
import useFuseLayoutSettings from '@components/adapters/useLayoutSettings';
import { Layout1ConfigDefaultsType } from '@/components/theme-layouts/layout1/Layout1Config';
import { useNavbarContext } from '../../components/navbar/contexts/NavbarContext/useNavbarContext';

type NavbarToggleFabLayout1Props = {
	className?: string;
};

/**
 * The navbar toggle fab layout 1.
 */
function NavbarToggleFabLayout1(props: NavbarToggleFabLayout1Props) {
	const { className } = props;
	const { toggleMobileNavbar, toggleNavbar } = useNavbarContext();
	const isMobile = useThemeMediaQuery((theme) => theme.breakpoints.down('lg'));

	const settings = useFuseLayoutSettings();
	const config = settings.config as Layout1ConfigDefaultsType;

	return (
		<NavbarToggleFab
			className={className}
			onClick={() => {
				if (isMobile) {
					toggleMobileNavbar();
				} else {
					toggleNavbar();
				}
			}}
			position={config.navbar.position}
		/>
	);
}

export default NavbarToggleFabLayout1;
