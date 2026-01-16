/**
 * Shared CLI utilities for documentation scripts.
 * Provides argument parsing helpers used across validation and fix tools.
 */

/** CLI configuration for parsing. */
export interface CliConfig {
  /** Default directories to exclude. */
  defaultExcludeDirs?: readonly string[];
  /** Script description for help text. */
  description: string;
  /** Available options. */
  options?: CliOption[];
  /** Usage examples. */
  usageExamples?: string[];
}

/** CLI option definition. */
export interface CliOption {
  /** Option aliases (e.g., ["--help", "-h"]). */
  aliases: string[];
  /** Description for help text. */
  description: string;
  /** Whether option takes a value. */
  takesValue?: boolean;
  /** Placeholder for value in help text (e.g., "<dirs>"). */
  valuePlaceholder?: string;
}

/** Parsed CLI arguments result. */
export interface ParsedArgs {
  /** Additional directories to exclude from processing. */
  excludeDirs: string[];
  /** Files specified as positional arguments. */
  files: string[];
  /** Whether help was requested. */
  help: boolean;
}

/**
 * Gets CLI arguments (process.argv.slice(2)).
 *
 * @returns Array of CLI arguments
 */
export function getArgs(): string[] {
  return process.argv.slice(2);
}

/**
 * Parses CLI arguments with support for common options.
 *
 * @returns Parsed arguments object
 */
export function parseArgs(): ParsedArgs {
  const args = getArgs();
  const result: ParsedArgs = {
    excludeDirs: [],
    files: [],
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--exclude-dirs" || arg === "--exclude-dir") {
      const nextArg = args[i + 1];
      if (!nextArg || nextArg.startsWith("--")) {
        console.error(`Error: ${arg} requires a comma-separated list of directories`);
        console.error("Use --help for usage information");
        process.exit(1);
      }

      const additionalDirs = nextArg
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      result.excludeDirs.push(...additionalDirs);
      i++; // Skip next arg since we consumed it
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg.startsWith("--")) {
      console.error(`Unknown option: ${arg}`);
      console.error("Use --help for usage information");
      process.exit(1);
    } else {
      // Positional argument (file path)
      result.files.push(arg);
    }
  }

  return result;
}

/**
 * Parses arguments and handles help flag automatically.
 *
 * @param config - CLI configuration
 * @returns Parsed arguments (exits if help requested)
 */
export function parseArgsWithHelp(config: CliConfig): ParsedArgs {
  const parsed = parseArgs();

  if (parsed.help) {
    printHelp(config);
  }

  return parsed;
}

/**
 * Prints help message and exits.
 *
 * @param config - CLI configuration
 */
export function printHelp(config: CliConfig): void {
  console.log(config.description);
  console.log("");
  console.log("Usage:");

  if (config.usageExamples && config.usageExamples.length > 0) {
    for (const example of config.usageExamples) {
      console.log(`  ${example}`);
    }
  }

  console.log("");
  console.log("Options:");
  console.log("  --exclude-dirs <dirs>  Comma-separated list of additional directories to exclude");
  console.log("  --help, -h             Show this help message");

  if (config.options) {
    for (const opt of config.options) {
      const aliasStr = opt.aliases.join(", ");
      const valueStr = opt.valuePlaceholder ? ` ${opt.valuePlaceholder}` : "";
      console.log(`  ${aliasStr}${valueStr}  ${opt.description}`);
    }
  }

  if (config.defaultExcludeDirs && config.defaultExcludeDirs.length > 0) {
    console.log("");
    console.log("Default excluded directories:", config.defaultExcludeDirs.join(", "));
  }

  process.exit(0);
}
