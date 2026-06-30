import { t } from '@lib/i18n';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import FuseSvgIcon from '@components/adapters/Icon';
import JwtSignInForm from '@auth/services/jwt/components/JwtSignInForm';

function jwtSignInTab() {
	return (
		<div className="w-full">
			<JwtSignInForm />

			<div className="mt-8 flex items-center">
				<div className="mt-px flex-auto border-t" />
				<Typography
					className="mx-2"
					color="text.secondary"
				>
					{t('auth.orContinueWith')}
				</Typography>
				<div className="mt-px flex-auto border-t" />
			</div>

			<div className="mt-8 flex items-center gap-4">
				<Button
					variant="outlined"
					className="flex-auto"
				>
					<FuseSvgIcon
						size={20}
						color="action"
					>
						feather:facebook
					</FuseSvgIcon>
				</Button>
				<Button
					variant="outlined"
					className="flex-auto"
				>
					<FuseSvgIcon
						size={20}
						color="action"
					>
						feather:twitter
					</FuseSvgIcon>
				</Button>
				<Button
					variant="outlined"
					className="flex-auto"
				>
					<FuseSvgIcon
						size={20}
						color="action"
					>
						feather:github
					</FuseSvgIcon>
				</Button>
			</div>
		</div>
	);
}

export default jwtSignInTab;
