import { t } from '@lib/i18n';
import { useState } from 'react';
import clsx from 'clsx';
import Button from '@mui/material/Button';
import FuseSvgIcon from '@components/adapters/Icon';
import Dialog from '@mui/material/Dialog';
import FuseHighlight from '@fuse/core/FuseHighlight';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import qs from 'qs';
import Typography from '@mui/material/Typography';
import useFuseSettings from '@components/adapters/useFuseSettings';

type FuseSettingsViewerDialogProps = {
	className?: string;
};

/**
 * The settings viewer dialog.
 */
function FuseSettingsViewerDialog(props: FuseSettingsViewerDialogProps) {
	const { className = '' } = props;

	const [openDialog, setOpenDialog] = useState(false);
	const { data: settings } = useFuseSettings();

	const jsonStringifiedSettings = JSON.stringify(settings);
	const queryString = qs.stringify({
		defaultSettings: jsonStringifiedSettings,
		strictNullHandling: true
	});

	function handleOpenDialog() {
		setOpenDialog(true);
	}

	function handleCloseDialog() {
		setOpenDialog(false);
	}

	return (
		<div className={clsx('', className)}>
			<Button
				variant="contained"
				color="secondary"
				className="w-full"
				onClick={handleOpenDialog}
				startIcon={<FuseSvgIcon>lucide:code-xml</FuseSvgIcon>}
			>
				{t('layout.viewSettings')}
			</Button>

			<Dialog
				open={openDialog}
				onClose={handleCloseDialog}
				aria-labelledby="form-dialog-title"
			>
				<DialogTitle>{t('layout.settingsViewerTitle')}</DialogTitle>
				<DialogContent>
					<Typography className="mt-6 mb-4 text-lg font-bold">JSON</Typography>

					<FuseHighlight
						component="pre"
						className="language-json"
					>
						{JSON.stringify(settings, null, 2)}
					</FuseHighlight>

					<Typography className="mt-6 mb-4 text-lg font-bold">{t('layout.queryParams')}</Typography>

					{queryString}
				</DialogContent>
				<DialogActions>
					<Button
						color="secondary"
						variant="contained"
						onClick={handleCloseDialog}
					>
						{t('common.close')}
					</Button>
				</DialogActions>
			</Dialog>
		</div>
	);
}

export default FuseSettingsViewerDialog;
