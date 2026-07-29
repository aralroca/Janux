import { createStep, createWorkflow, createWorkflowRunner, type HarnessStorage } from '@janux/agent';

export interface ProvisioningState {
  requestedBy: string;
  plan?: string;
  activatedAt?: number;
}

/**
 * Two steps with a human (and possibly a restart) in between: `collect-plan`
 * suspends waiting for an answer and `activate` completes with the state
 * intact — between the two calls the run lives only in storage.
 */
export const provisioning = createWorkflow<ProvisioningState>({
  id: 'provisioning',
  initialState: (input) => ({
    requestedBy: String((input as { requestedBy?: string } | undefined)?.requestedBy ?? 'anonymous'),
  }),
  steps: [
    createStep({
      id: 'collect-plan',
      run: ({ state, resumeData, suspend }) => {
        if (resumeData) {
          state.plan = String(resumeData);

          return;
        }
        suspend({ question: 'Which plan should this workspace start on?' });
      },
    }),
    createStep({
      id: 'activate',
      run: ({ state }) => {
        state.activatedAt = Date.now();
      },
    }),
  ],
});

/** Each process instance builds its own runner; durability lives in the shared storage. */
export function provisioningRunner(storage: HarnessStorage) {
  return createWorkflowRunner(storage);
}
