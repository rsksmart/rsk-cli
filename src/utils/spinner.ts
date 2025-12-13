import ora, { Ora } from "ora";

export interface SpinnerWrapper {
  start(message: string): void;
  stop(): void;
  succeed(message: string): void;
  fail(message: string): void;
  warn(message: string): void;
  update(message: string): void;
}

export function createSpinner(isExternal: boolean): SpinnerWrapper {
  const oraInstance: Ora = ora({ isEnabled: !isExternal });

  return {
    start(message: string): void {
      if (!isExternal) {
        oraInstance.start(message);
      }
    },

    stop(): void {
      if (!isExternal) {
        oraInstance.stop();
      }
    },

    succeed(message: string): void {
      if (!isExternal) {
        oraInstance.succeed(message);
      }
    },

    fail(message: string): void {
      if (!isExternal) {
        oraInstance.fail(message);
      }
    },

    warn(message: string): void {
      if (!isExternal) {
        oraInstance.warn(message);
      }
    },

    update(message: string): void {
      if (!isExternal) {
        oraInstance.text = message;
      }
    }
  };
}
