import Typography from '@mui/material/Typography';
import Link from '@components/adapters/Link';
import { t } from '@lib/i18n'

function SignInPageTitle() {
	return (
		<div className="w-full">
			{/* Logo + heading clustered tightly: the previous layout had
			    `mt-8` between the favicon and the title, which left an
			    orphan logo floating above. Pulling them onto one row
			    (logo · title) reads as a single brand block. */}
			<div className="flex items-center gap-3">
				<img
					className="w-10"
					src="/favicon.svg"
					alt="Flyto2 Warroom"
				/>
				<Typography className="text-4xl leading-[1.1] font-extrabold tracking-tight">
					{t('auth.signIn')}
				</Typography>
			</div>
			<div className="mt-1.5 flex items-baseline font-medium">
				<Typography>{t('auth.noAccount')}</Typography>
				<Link
					className="ml-1"
					to="/sign-up"
				>
					{t('auth.register')}
				</Link>
			</div>
		</div>
	);
}

export default SignInPageTitle;
