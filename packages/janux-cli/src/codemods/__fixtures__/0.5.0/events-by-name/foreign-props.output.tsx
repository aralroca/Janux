// @file: src/components/Panel.tsx
import { foreign } from 'janux/interop';
import { Switch } from '@radix-ui/react-switch';

/**
 * A React component mounted through `foreign()` owns its own props. `on` is an
 * ordinary prop name here, not the removed event binding, and renaming it would
 * break a component that was never written against the old syntax.
 */
export const Toggle = foreign({
  name: 'toggle',
  component: () => <Switch on={true} intent="primary" />,
});
