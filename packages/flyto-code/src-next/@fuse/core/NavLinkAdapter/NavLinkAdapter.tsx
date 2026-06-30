import { NavLink } from 'react-router';
import { CSSProperties, ReactNode } from 'react';

export type NavLinkAdapterPropsType = {
	activeClassName?: string;
	activeStyle?: CSSProperties;
	children?: ReactNode;
	to?: string;
	href?: string;
	className?: string;
	style?: CSSProperties;
	role?: string;
	end?: boolean;
	exact?: boolean;
	ref?: React.RefObject<HTMLAnchorElement>;
};

/**
 * The NavLinkAdapter component is a wrapper around the Next.js Link component.
 * It adds the ability to navigate programmatically using the useRouter hook.
 * The component is memoized to prevent unnecessary re-renders.
 */
function NavLinkAdapter(props: NavLinkAdapterPropsType) {
	const { children, activeClassName = 'active', activeStyle, role = 'button', to, href, ref, exact, end, ..._props } = props;

	const targetUrl = to || href;
	const matchEnd = end ?? exact;

	return (
		<NavLink
			role={role}
			to={targetUrl}
			end={matchEnd}
			className={({ isActive }) =>
				[_props.className, isActive ? activeClassName : null].filter(Boolean).join(' ')
			}
			style={({ isActive }) => ({
				..._props.style,
				...(isActive ? activeStyle : null)
			})}
			ref={ref}
			{..._props}
		>
			{children}
		</NavLink>
	);
}

export default NavLinkAdapter;
