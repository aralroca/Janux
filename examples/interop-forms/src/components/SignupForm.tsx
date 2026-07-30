/** @jsxImportSource react */
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const signup = z.object({
  name: z.string().min(2, 'Name needs at least 2 characters'),
  email: z.email('That is not an email address'),
  plan: z.enum(['free', 'pro', 'team']),
});

export type Signup = z.infer<typeof signup>;

export interface SignupFormProps {
  draft: Signup;
  onSubmitted?: (values: Signup) => void;
}

/**
 * A plain react-hook-form. RHF keeps its own copy of the form state in
 * uncontrolled inputs — that is the whole reason it is fast — so the island is
 * NOT the single owner here, and the two are reconciled explicitly below.
 */
export function SignupForm({ draft, onSubmitted }: SignupFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Signup>({ resolver: zodResolver(signup), defaultValues: draft, mode: 'onSubmit' });

  // The reconciliation. An agent calling `signup.fill` writes island state, and
  // RHF would never notice: its inputs are uncontrolled. `reset` pushes the new
  // draft into the form, which is what makes the agent's fill visible.
  useEffect(() => {
    reset(draft);
  }, [draft, reset]);

  return (
    <form className="signup" onSubmit={handleSubmit((values) => onSubmitted?.(values))} noValidate>
      <label className="field">
        <span>Name</span>
        <input className="input" {...register('name')} />
        {errors.name ? <em className="error">{errors.name.message}</em> : null}
      </label>
      <label className="field">
        <span>Email</span>
        <input className="input" {...register('email')} />
        {errors.email ? <em className="error">{errors.email.message}</em> : null}
      </label>
      <label className="field">
        <span>Plan</span>
        <select className="input" {...register('plan')}>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="team">Team</option>
        </select>
      </label>
      <button className="submit" type="submit">
        Create account
      </button>
    </form>
  );
}
