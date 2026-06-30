'use client';

import Typography from '@mui/material/Typography';
import clsx from 'clsx';
import { addDays, differenceInSeconds } from 'date-fns';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

type FuseCountdownProps = {
	onComplete?: () => void;
	endDate?: Date | string | number;
	className?: string;
};

function toDate(input: Date | string | number): Date {
	return input instanceof Date ? input : new Date(input);
}

/**
 * FuseCountdown
 * A React component used to display the number of days, hours, minutes and seconds left until a specified end date.
 * It allows a callback function to be passed in to be executed when the end date is reached.
 */
function FuseCountdown(props: FuseCountdownProps) {
	const { onComplete, endDate = addDays(new Date(), 15), className } = props;

	const [endDateVal] = useState<Date>(() => toDate(endDate));
	const [countdown, setCountdown] = useState({
		days: 0,
		hours: 0,
		minutes: 0,
		seconds: 0
	});
	const intervalRef = useRef<number | null>(null);

	const complete = useCallback(() => {
		if (intervalRef.current) {
			window.clearInterval(intervalRef.current);
		}

		if (onComplete) {
			onComplete();
		}
	}, [onComplete]);

	const tick = useCallback(() => {
		const diff = differenceInSeconds(endDateVal, new Date());

		if (diff < 0) {
			complete();
			return;
		}

		setCountdown({
			days: Math.floor(diff / 86400),
			hours: Math.floor((diff % 86400) / 3600),
			minutes: Math.floor((diff % 3600) / 60),
			seconds: diff % 60
		});
	}, [complete, endDateVal]);

	useEffect(() => {
		intervalRef.current = window.setInterval(tick, 1000);
		tick();
		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
			}
		};
	}, [tick]);

	return (
		<div className={clsx('flex items-center', className)}>
			<div className="flex flex-col items-center justify-center px-3">
				<Typography
					variant="h4"
					className="mb-1"
				>
					{countdown.days}
				</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
				>
					days
				</Typography>
			</div>
			<div className="flex flex-col items-center justify-center px-3">
				<Typography
					variant="h4"
					className="mb-1"
				>
					{countdown.hours}
				</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
				>
					hours
				</Typography>
			</div>
			<div className="flex flex-col items-center justify-center px-3">
				<Typography
					variant="h4"
					className="mb-1"
				>
					{countdown.minutes}
				</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
				>
					minutes
				</Typography>
			</div>
			<div className="flex flex-col items-center justify-center px-3">
				<Typography
					variant="h4"
					className="mb-1"
				>
					{countdown.seconds}
				</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
				>
					seconds
				</Typography>
			</div>
		</div>
	);
}

export default memo(FuseCountdown);
