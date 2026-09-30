import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

type Variant = 'primary' | 'cloud' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-local text-white hover:brightness-110 dark:text-paper',
  cloud: 'bg-cloud text-white hover:brightness-110 dark:text-paper',
  secondary: 'border border-line bg-surface text-ink hover:border-muted',
  ghost: 'text-muted hover:bg-line/50 hover:text-ink',
  danger: 'border border-danger/40 text-danger hover:bg-danger-soft',
};

const SIZES = {
  sm: { fixed: 'h-7 px-2.5 text-[0.8rem]', wrap: 'min-h-7 px-2.5 py-1 text-[0.8rem]' },
  md: { fixed: 'h-9 px-3.5 text-sm', wrap: 'min-h-9 px-3.5 py-2 text-sm' },
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  /** Lets a long label wrap, for full-width buttons that must fit a narrow panel. */
  wrap?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', wrap = false, className = '', type = 'button', ...props },
  ref,
) {
  const sizing = wrap
    ? `${SIZES[size].wrap} text-center leading-snug [overflow-wrap:anywhere]`
    : `${SIZES[size].fixed} whitespace-nowrap`;
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-[filter,background-color,border-color] disabled:pointer-events-none disabled:opacity-50 ${sizing} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
});

export function IconButton({
  label,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-line/60 hover:text-ink disabled:opacity-40 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[0.8rem] text-muted">{description}</span>
        )}
      </span>
      <span className="relative mt-0.5 inline-flex flex-none">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="h-5 w-9 rounded-full bg-line transition-colors peer-checked:bg-local peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-local" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-surface shadow-sm transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className = '', ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`h-9 w-full rounded-[10px] border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70 focus:border-local focus:outline-none ${className}`}
        {...props}
      />
    );
  },
);

/** A native modal <dialog>, opened while `open` is true. Escape and the backdrop close it. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const headingId = labelledBy ?? `dialog-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-auto w-[min(26rem,calc(100vw-1.5rem))] rounded-[14px] border border-line bg-surface p-0 text-ink shadow-xl"
    >
      <div className="p-5">
        <h2 id={headingId} className="text-base font-semibold">
          {title}
        </h2>
        <div className="mt-3">{children}</div>
      </div>
    </dialog>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-1.5 w-full overflow-hidden rounded-full bg-line"
    >
      <div
        className="h-full rounded-full bg-local transition-[width]"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
