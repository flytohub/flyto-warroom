import { Box } from '@mui/material';
import Typography from '@mui/material/Typography';
import clsx from 'clsx';
import Link from '@components/adapters/Link';
import FuseSvgIcon from '@components/adapters/Icon';
import { t } from '@lib/i18n';


type GoToDocBoxProps = {
	className?: string;
};

function GoToDocBox(props: GoToDocBoxProps) {
	const { className } = props;
	return (
		<Box
			className={clsx('documentation-hero flex flex-col gap-2 rounded-sm border-1 px-3 py-2', className)}
			sx={{ backgroundColor: 'background.paper', borderColor: 'divider' }}
		>
			<Typography className="truncate">{t('hardcoded.need.assistance.to.get.started.fbd21927')}</Typography>
			<Typography
				className="flex items-center gap-1 truncate"
				component={Link}
				to="/documentation"
				color="secondary"
			>
				View documentation <FuseSvgIcon>lucide:arrow-right</FuseSvgIcon>
			</Typography>
		</Box>
	);
}

export default GoToDocBox;
