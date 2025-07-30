import chalk from "chalk";

export const logType = {
  error: chalk.bgRed("Error: "),
  info: chalk.bgCyan("Info: "),
  output: chalk.bgGreen("Output: "),
};

// console.log(logType.error, "error");
// console.log(logType.info, "info");
// console.log(logType.output, "output");

// type Props = {
//   type: "info" | "output" | "error";
//   text: string;
// };

// export function log({ type, text }: Props) {
//   // chalk.bgBlack;
//   const bgColor =
//     type === "error"
//       ? chalk.bgRed
//       : type === "info"
//       ? chalk.bgCyan
//       : chalk.bgGreen;

//   const typeText =
//     type === "error" ? "Error:" : type === "info" ? "Info:" : "Output:";

//   console.log(bgColor(typeText), text);
// }

// log({ type: "error", text: "error" });
// log({ type: "info", text: "info" });
// log({ type: "output", text: "output" });

// console.log("........................");
