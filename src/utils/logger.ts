import chalk from "chalk";

export function logMessage(
  isExternal: boolean,
  message: string,
  color: any = chalk.white
) {
  if (!isExternal) {
    console.log(color(message));
  }
}

export function logError(isExternal: boolean, message: string) {
  logMessage(isExternal, message, chalk.red);
}

export function logSuccess(isExternal: boolean, message: string) {
  logMessage(isExternal, message, chalk.green);
}

export function logInfo(isExternal: boolean, message: string) {
  logMessage(isExternal, message, chalk.blue);
}

export function logWarning(isExternal: boolean, message: string) {
  logMessage(isExternal, message, chalk.yellow);
}
