import {
  useState,
  useCallback,
  createContext,
  useContext,
  type RefObject,
  useEffect,
  useId,
  useRef,
  type ComponentPropsWithRef,
  type ReactNode,
} from "react";
import { clsx } from "clsx";
import { cva, type VariantProps } from "class-variance-authority";
import * as Menu from "@radix-ui/react-dropdown-menu";
export const cn = clsx;
const button = cva("pf-button", {
  variants: {
    variant: {
      default: "",
      primary: "pf-primary",
      secondary: "pf-secondary",
      ghost: "pf-ghost",
      danger: "pf-danger",
      link: "pf-link",
    },
    size: { default: "", sm: "pf-small", icon: "pf-icon", lg: "pf-large" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ComponentPropsWithRef<"button"> & VariantProps<typeof button>) {
  return <button type={type} className={cn(button({ variant, size }), className)} {...props} />;
}
export function Switch({
  className,
  role = "switch",
  ...props
}: Omit<ComponentPropsWithRef<"input">, "type">) {
  return <input type="checkbox" role={role} className={cn("pf-switch", className)} {...props} />;
}
export function Input({ className, type, ...props }: ComponentPropsWithRef<"input">) {
  return type === "checkbox" ? (
    <Switch role={props.role ?? "checkbox"} className={className} {...props} />
  ) : (
    <input type={type} className={cn("pf-input", className)} {...props} />
  );
}
export function Select({ className, ...props }: ComponentPropsWithRef<"select">) {
  return <select className={cn("pf-select", className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentPropsWithRef<"textarea">) {
  return <textarea className={cn("pf-textarea", className)} {...props} />;
}
export function Panel({
  as: Tag = "section",
  className,
  children,
  ...props
}: Omit<ComponentPropsWithRef<"section">, "ref"> & { as?: "section" | "aside" | "div" }) {
  return (
    <Tag className={cn("pf-panel", className)} {...props}>
      {children}
    </Tag>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="pf-empty">
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Dialog({
  title,
  description,
  children,
  onClose,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const modal = ref.current!;
    modal.showModal();
    return () => {
      modal.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={cn("pf-dialog", className)}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2 id={id}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <Button size="icon" aria-label={"Close " + title} onClick={onClose}>
          ×
        </Button>
      </header>
      <div className="pf-dialog-body">{children}</div>
    </dialog>
  );
}
const MenuOrigin = createContext<RefObject<HTMLButtonElement | null> | null>(null);
export function ActionMenu({
  label,
  children,
  badge,
}: {
  label: string;
  children: ReactNode;
  badge?: number;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <MenuOrigin.Provider value={trigger}>
      <Menu.Root modal={false}>
        <Menu.Trigger asChild>
          <Button ref={trigger} aria-label={label}>
            {label} {!!badge && <span className="pf-tag">{badge}</span>}{" "}
            <span aria-hidden="true">⌄</span>
          </Button>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className="pf-menu" align="end" sideOffset={8}>
            {children}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </MenuOrigin.Provider>
  );
}
export function MenuItem({
  children,
  onSelect,
  disabled,
}: {
  children: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const origin = useContext(MenuOrigin);
  return (
    <Menu.Item
      className="pf-menu-item"
      disabled={disabled}
      onSelect={() => {
        origin?.current?.focus();
        onSelect();
      }}
    >
      {children}
    </Menu.Item>
  );
}

const Confirmation = createContext<(message: string) => Promise<boolean>>(() =>
  Promise.resolve(false),
);
export const useConfirm = () => useContext(Confirmation);
export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string>();
  const pending = useRef<((value: boolean) => void) | undefined>(undefined);
  const confirm = useCallback(
    (text: string) =>
      new Promise<boolean>((resolve) => {
        pending.current?.(false);
        pending.current = resolve;
        setMessage(text);
      }),
    [],
  );
  const finish = (value: boolean) => {
    pending.current?.(value);
    pending.current = undefined;
    setMessage(undefined);
  };
  useEffect(() => () => pending.current?.(false), []);
  return (
    <Confirmation.Provider value={confirm}>
      {children}
      {message && (
        <Dialog title="Confirm action" onClose={() => finish(false)}>
          <p>{message}</p>
          <footer>
            <Button autoFocus onClick={() => finish(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => finish(true)}>
              Confirm
            </Button>
          </footer>
        </Dialog>
      )}
    </Confirmation.Provider>
  );
}
