import type { Schemas } from '@aievo/api-client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { gitCredentialsQuery } from '@/features/github/queries';

import { templatesQuery, useCreateProject } from '../queries';
import { ExistingRepoStep } from './ExistingRepoStep';
import type { ExistingRepoValues } from './ExistingRepoStep';
import { NewRepoStep } from './NewRepoStep';
import type { NewRepoValues } from './NewRepoStep';
import { SummaryStep } from './SummaryStep';
import { toRequestBody } from './wizard-values';
import type { WizardMode, WizardValues } from './wizard-values';

type Credentials = [Schemas['GitCredential'], ...Schemas['GitCredential'][]];

const STEPS = [
  { key: 'mode', label: 'Start' },
  { key: 'details', label: 'Repository' },
  { key: 'summary', label: 'Summary' },
] as const;

type Step = (typeof STEPS)[number]['key'];

const MODES: { value: WizardMode; title: string; description: string }[] = [
  {
    value: 'new',
    title: 'Create a new repository',
    description: 'AIEvo creates it on GitHub from a template, with a working app and tests.',
  },
  {
    value: 'existing',
    title: 'Connect an existing repository',
    description: 'Pick one of your repositories and tell AIEvo how to install, build and test it.',
  },
];

function StepIndicator({ current }: { current: Step }) {
  return (
    <ol aria-label="Wizard steps" className="flex gap-4 text-sm">
      {STEPS.map((step, index) => (
        <li
          key={step.key}
          aria-current={step.key === current ? 'step' : undefined}
          className={step.key === current ? 'font-medium text-foreground' : 'text-muted-foreground'}
        >
          {index + 1}. {step.label}
        </li>
      ))}
    </ol>
  );
}

interface ModeStepProps {
  mode: WizardMode;
  onModeChange: (mode: WizardMode) => void;
  credentials: Credentials;
  credentialId: string;
  onCredentialChange: (id: string) => void;
  onNext: () => void;
}

function ModeStep(props: ModeStepProps) {
  const { mode, onModeChange, credentials, credentialId, onCredentialChange, onNext } = props;
  return (
    <form
      className="flex flex-col gap-5"
      aria-label="Start"
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
    >
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">How do you want to start?</legend>
        {MODES.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-2 rounded-lg border p-4 text-sm has-checked:border-foreground has-checked:bg-muted"
          >
            <input
              type="radio"
              name="mode"
              className="mt-0.5"
              checked={mode === option.value}
              onChange={() => onModeChange(option.value)}
            />
            <span>
              <span className="font-medium">{option.title}</span>
              <span className="block text-muted-foreground">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {credentials.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="wizard-credential" className="text-sm font-medium">
            GitHub token
          </label>
          <Select value={credentialId} onValueChange={onCredentialChange}>
            <SelectTrigger id="wizard-credential" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {credentials.map((credential) => (
                <SelectItem key={credential.id} value={credential.id}>
                  {credential.label} ({credential.githubLogin})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex justify-between gap-2">
        <Button asChild variant="outline">
          <Link to="/projects">Cancel</Link>
        </Button>
        <Button type="submit">Next</Button>
      </div>
    </form>
  );
}

function ProjectWizard({ credentials }: { credentials: Credentials }) {
  const navigate = useNavigate();
  const templates = useQuery(templatesQuery());
  const createProject = useCreateProject();
  const [step, setStep] = useState<Step>('mode');
  const [mode, setMode] = useState<WizardMode>('new');
  const [credentialId, setCredentialId] = useState(credentials[0].id);
  // Kept per path, so going back shows what was already entered.
  const [existing, setExisting] = useState<ExistingRepoValues>();
  const [fresh, setFresh] = useState<NewRepoValues>();

  const values: WizardValues | undefined = mode === 'existing' ? existing : fresh;

  function toSummary() {
    createProject.reset();
    setStep('summary');
  }

  async function create(body: WizardValues) {
    let project: Schemas['Project'];
    try {
      project = await createProject.mutateAsync(toRequestBody(body));
    } catch {
      // Shown by the summary from the mutation state.
      return;
    }
    toast.success(`Project "${project.name}" created`);
    await navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
  }

  let content;
  if (step === 'mode') {
    content = (
      <ModeStep
        mode={mode}
        onModeChange={setMode}
        credentials={credentials}
        credentialId={credentialId}
        onCredentialChange={setCredentialId}
        onNext={() => setStep('details')}
      />
    );
  } else if (step === 'details' && mode === 'existing') {
    content = (
      <ExistingRepoStep
        credentialId={credentialId}
        initial={existing}
        onBack={() => setStep('mode')}
        onNext={(next) => {
          setExisting(next);
          toSummary();
        }}
      />
    );
  } else if (step === 'details') {
    content = templates.isPending ? (
      <LoadingState label="Loading templates" />
    ) : templates.isError ? (
      <ErrorState
        error={templates.error}
        title="Could not load templates"
        onRetry={() => void templates.refetch()}
      />
    ) : (
      <NewRepoStep
        credentialId={credentialId}
        templates={templates.data}
        initial={fresh}
        onBack={() => setStep('mode')}
        onNext={(next) => {
          setFresh(next);
          toSummary();
        }}
      />
    );
  } else if (values) {
    content = (
      <SummaryStep
        values={values}
        template={
          values.mode === 'new'
            ? templates.data?.find((template) => template.id === values.template)
            : undefined
        }
        isCreating={createProject.isPending}
        error={createProject.error}
        onBack={() => setStep('details')}
        onCreate={() => void create(values)}
      />
    );
  }

  return (
    <>
      <StepIndicator current={step} />
      {content}
    </>
  );
}

export function ProjectWizardPage() {
  const credentials = useQuery(gitCredentialsQuery());
  const list = credentials.data;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          to="/projects"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Projects
        </Link>
        <h1 className="text-2xl font-semibold">New project</h1>
      </header>

      {credentials.isPending ? (
        <LoadingState label="Loading GitHub tokens" />
      ) : credentials.isError ? (
        <ErrorState
          error={credentials.error}
          title="Could not load GitHub tokens"
          onRetry={() => void credentials.refetch()}
        />
      ) : list && list.length > 0 ? (
        <ProjectWizard credentials={list as Credentials} />
      ) : (
        <EmptyState
          title="Add a GitHub token first"
          description="Every project works on a GitHub repository. The wizard lists and creates repositories with your token."
          action={
            <Button asChild>
              <Link to="/settings/github">Open GitHub settings</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
