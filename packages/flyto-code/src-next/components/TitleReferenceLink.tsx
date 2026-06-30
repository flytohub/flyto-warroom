'use client';

import { Tooltip, Typography } from '@mui/material';
import Link from '@components/adapters/Link';
import usePathname from '@components/adapters/usePathname';
import { useState } from 'react';
import Box from '@mui/material/Box';
import { t } from '@lib/i18n';

type TitleReferenceLinkProps = {
	id: string;
	children?: React.ReactNode;
};

function TitleReferenceLink(props: TitleReferenceLinkProps) {
	const { children = '#', id = '' } = props;
	const pathname = usePathname();
	const href = `${window.location.origin}${pathname}#${id}`;
	const [open, setOpen] = useState(false);

	function handleCopy() {
		navigator.clipboard.writeText(href);
		setOpen(true);
		setTimeout(() => {
			setOpen(false);
		}, 800);
	}

	return (
		<Tooltip
			title={t('common.copied')}
			open={open}
			slotProps={{ popper: { placement: 'top' } }}
			arrow
		>
			<Box
				component="span"
				id={id}
			>
				<Typography
					component={Link}
					to={href}
					className="italic opacity-30"
					sx={{ color: 'inherit!important', textDecoration: 'none!important' }}
					onClick={handleCopy}
				>
					{children}
				</Typography>
			</Box>
		</Tooltip>
	);
}

export default TitleReferenceLink;
