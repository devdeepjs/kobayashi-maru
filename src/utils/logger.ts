import chalk from "chalk";

export const logger = {
  info: (msg: string) => console.log(chalk.cyan("ℹ ") + msg),
  success: (msg: string) => console.log(chalk.green("✔ ") + msg),
  warn: (msg: string) => console.log(chalk.yellow("⚠ ") + msg),
  error: (msg: string) => console.log(chalk.red("✖ ") + msg),
  step: (step: number, title: string) =>
    console.log(chalk.bold.magenta(`\n[${step}] `) + chalk.bold(title)),
  banner: () => {
    console.log(chalk.bold.hex("#FF79C6")(`
  ██╗  ██╗ ██████╗ ██████╗  █████╗ ██╗   ██╗ █████╗ ███████╗██╗  ██╗██╗
  ██║ ██╔╝██╔═══██╗██╔══██╗██╔══██╗╚██╗ ██╔╝██╔══██╗██╔════╝██║  ██║██║
  █████╔╝ ██║   ██║██████╔╝███████║ ╚████╔╝ ███████║███████╗███████║██║
  ██╔═██╗ ██║   ██║██╔══██╗██╔══██║  ╚██╔╝  ██╔══██║╚════██║██╔══██║██║
  ██║  ██╗╚██████╔╝██████╔╝██║  ██║   ██║   ██║  ██║███████║██║  ██║██║
  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝
    Token-Efficient Agent Harness for Pi • Zero-Bloat Routing Engine
    `));
  },
};
