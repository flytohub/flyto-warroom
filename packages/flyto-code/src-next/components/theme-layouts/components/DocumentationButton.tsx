import Button from '@mui/material/Button';
import Link from '@components/adapters/Link';
import FuseSvgIcon from '@components/adapters/Icon';

type DocumentationButtonProps = {
	className?: string;
};

/**
 * The documentation button.
 */
function DocumentationButton(props: DocumentationButtonProps) {
	const { className = '' } = props;

	return (
		<Button
			component={Link}
			to="/documentation"
			role="button"
			className={className}
			variant="contained"
			color="primary"
			startIcon={<FuseSvgIcon>lucide:book-open</FuseSvgIcon>}
		>
			Documentation
		</Button>
	);
}

export default DocumentationButton;
