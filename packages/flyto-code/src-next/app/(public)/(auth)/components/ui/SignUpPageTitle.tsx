import Typography from '@mui/material/Typography';
import Link from '@components/adapters/Link';
import { t } from '@lib/i18n'

function SignUpPageTitle({ localBootstrap = false }: { localBootstrap?: boolean }) {
	return (
		<div className="w-full">
			{/* Mirror SignInPageTitle: logo + title on one row, no
			    orphan favicon floating above. */}
			<div className="flex items-center gap-3">
				<img
					className="w-10"
					src="/favicon.svg"
					alt="logo"
				/>
				<Typography className="text-4xl leading-[1.1] font-extrabold tracking-tight">
					{localBootstrap ? t('auth.localBootstrap.title') : t('auth.register')}
				</Typography>
			</div>
			<div className="mt-1.5 flex items-baseline font-medium">
			<Typography>
				{localBootstrap
					? t('auth.localBootstrap.hasAdmin')
					: t('auth.hasAccount')}
			</Typography>
				<Link
					className="ml-1"
					to="/sign-in"
				>
					{t('auth.signIn')}
				</Link>
			</div>
		</div>
	);
}

export default SignUpPageTitle;
