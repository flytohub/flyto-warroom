import { Controller, useForm } from 'react-hook-form';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import FormHelperText from '@mui/material/FormHelperText';
import Button from '@mui/material/Button';
import isEmpty from 'lodash/isEmpty';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSnackbar } from 'notistack';
import firebase from 'firebase/compat/app';
import useFirebaseAuth from '../useFirebaseAuth';
import { FirebaseSignUpPayload } from '../FirebaseAuthProvider';
import { t } from '@lib/i18n';
/**
 * Form Validation Schema
 */
function createSchema() {
	return z
		.object({
			email: z.string().email(t('auth.validation.emailInvalid')).nonempty(t('auth.validation.emailRequired')),
			password: z
				.string()
				.nonempty(t('auth.validation.passwordRequired'))
				.min(8, t('auth.validation.passwordTooShort8')),
			passwordConfirm: z.string().nonempty(t('auth.validation.passwordConfirmRequired')),
			acceptTermsConditions: z.boolean().refine((val) => val === true, t('auth.validation.acceptTermsRequired'))
		})
		.refine((data) => data.password === data.passwordConfirm, {
			message: t('auth.validation.passwordsMustMatch'),
			path: ['passwordConfirm']
		});
}

const defaultValues = {
	email: '',
	password: '',
	passwordConfirm: '',
	acceptTermsConditions: false
};

function FirebaseSignUpForm() {
	const { signUp } = useFirebaseAuth();
	const schema = createSchema();

	const { control, formState, handleSubmit, setError } = useForm({
		mode: 'onChange',
		defaultValues,
		resolver: zodResolver(schema)
	});

	const { isValid, dirtyFields, errors } = formState;
	const { enqueueSnackbar } = useSnackbar();

	function onSubmit(formData: FirebaseSignUpPayload) {
		const { email, password } = formData;
		signUp({
			email,
			password
		})
			.then((_res) => {
				enqueueSnackbar(
					t('auth.verificationSent'),
					{ variant: 'success', autoHideDuration: 8000 },
				);
			})
			.catch((_error) => {
				const error = _error as firebase.auth.Error;

				const emailErrorCodes = ['auth/email-already-in-use', 'auth/invalid-email'];

				const passwordErrorCodes = ['auth/weak-password', 'auth/wrong-password'];

				const errors: {
					type: 'email' | 'password' | `root.${string}` | 'root';
					message: string;
				}[] = [];

				if (emailErrorCodes.includes(error.code)) {
					errors.push({
						type: 'email',
						message: error.message
					});
				}

				if (passwordErrorCodes.includes(error.code)) {
					errors.push({
						type: 'password',
						message: error.message
					});
				}

				errors.forEach((err) => {
					setError(err.type, {
						type: 'manual',
						message: err.message
					});
				});
			});
	}

	return (
		<form
			name="registerForm"
			noValidate
			className="flex w-full flex-col justify-center"
			onSubmit={handleSubmit(onSubmit)}
		>
			<Controller
				name="email"
				control={control}
				render={({ field }) => (
					<TextField
						{...field}
						className="mb-6"
						label={t('auth.email')}
						type="email"
						error={!!errors.email}
						helperText={errors?.email?.message}
						variant="outlined"
						required
						fullWidth
					/>
				)}
			/>

			<Controller
				name="password"
				control={control}
				render={({ field }) => (
					<TextField
						{...field}
						className="mb-6"
						label={t('auth.password')}
						type="password"
						error={!!errors.password}
						helperText={errors?.password?.message}
						variant="outlined"
						required
						fullWidth
					/>
				)}
			/>

			<Controller
				name="passwordConfirm"
				control={control}
				render={({ field }) => (
					<TextField
						{...field}
						className="mb-6"
						label={t('auth.passwordConfirm')}
						type="password"
						error={!!errors.passwordConfirm}
						helperText={errors?.passwordConfirm?.message}
						variant="outlined"
						required
						fullWidth
					/>
				)}
			/>

			<Controller
				name="acceptTermsConditions"
				control={control}
				render={({ field }) => (
					<FormControl error={!!errors.acceptTermsConditions}>
						<FormControlLabel
							label={t('auth.acceptTerms')}
							control={
								<Checkbox
									size="small"
									{...field}
								/>
							}
						/>
						<FormHelperText>{errors?.acceptTermsConditions?.message}</FormHelperText>
					</FormControl>
				)}
			/>

			<Button
				variant="contained"
				color="primary"
				className="mt-6 w-full"
				aria-label={t('auth.register')}
				disabled={isEmpty(dirtyFields) || !isValid}
				type="submit"
				size="large"
			>
				{t('auth.createFreeAccount')}
			</Button>
		</form>
	);
}

export default FirebaseSignUpForm;
