import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import clsx from 'clsx';

const Root = styled('div')(({ theme }) => ({
	'& > .logo-icon': {
		transition: theme.transitions.create(['width', 'height'], {
			duration: theme.transitions.duration.shortest,
			easing: theme.transitions.easing.easeInOut
		})
	}
}));

type LogoProps = {
	className?: string;
};

function Logo(props: LogoProps) {
	const { className = '' } = props;
	return (
		<Root className={clsx('flex flex-shrink-0 flex-grow items-center gap-2', className)}>
			<img
				className="logo-icon h-8 w-8"
				src="/favicon.svg"
				alt="Warroom"
			/>
			<div className="logo-text flex flex-col">
				<Typography className="text-lg leading-none font-bold tracking-tight">
					<span style={{ color: '#a78bfa' }}>War</span>room
				</Typography>
			</div>
		</Root>
	);
}

export default Logo;
