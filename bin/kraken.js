#!/usr/bin/env node

const program = require('commander');
const chalk = require('chalk');
const { spawn } = require('child_process');
const { join, resolve } = require('path');
const packageJSON = require('../package.json');
const os = require('os');
const fs = require('fs');
const temp = require('temp');
const Qjsc = require('qjsc');
const exportDartCode = require('../lib/export_dart');

const SUPPORTED_JS_ENGINE = ['jsc'];

program
  .version(packageJSON.version)
  .usage('[filename|URL]')
  .description('Start a kraken app.')
  .option('-b --bundle <filename>', 'Bundle path. One of bundle or url is needed, if both determined, bundle path will be used.')
  .option('-u --url <URL>', 'Bundle URL. One of bundle or URL is needed, if both determined, bundle path will be used.')
  .option('-i --instruct <instruct>', 'instruct file path.')
  .option('-s, --source <source>', 'Source code. pass source directory from command line')
  .option('-m --runtime-mode <runtimeMode>', 'Runtime mode, debug | release.', 'debug')
  .option('--enable-kraken-js-log', 'print kraken js to dart log', false)
  .option('--show-performance-monitor', 'show render performance monitor', false)
  .option('-d, --debug-layout', 'debug element\'s paint layout', false)
  .action((options) => {
    let { bundle, url, source, instruct } = options;

    if (!bundle && !url && !source && !options.args) {
      program.help();
    } else {
      const firstArgs = options.args[0];

      if (firstArgs) {
        if (/^http/.test(firstArgs)) {
          url = firstArgs;
        } else {
          bundle = firstArgs;
        }
      }

      const env = Object.assign({}, process.env);

      const shellPath = getShellPath(options.runtimeMode);
      // only linux platform need this
      if (os.platform() === 'linux') {
        env['KRAKEN_LIBRARY_PATH'] = resolve(__dirname, '../build/lib');
      }

      if (options.enableKrakenJsLog) {
        env['ENABLE_KRAKEN_JS_LOG'] = 'true';
      }

      if (options.showPerformanceMonitor) {
        env['KRAKEN_ENABLE_PERFORMANCE_OVERLAY'] = true;
      }

      if (options.debugLayout) {
        env['KRAKEN_ENABLE_DEBUG'] = true;
      }

      if (options.jsEngine) {
        if (!SUPPORTED_JS_ENGINE.includes(options.jsEngine)) throw new Error(`unknown js engine: ${options.jsEngine}, supported: ${SUPPORTED_JS_ENGINE.join(',')}`)
        env['KRAKEN_JS_ENGINE'] = options.jsEngine;
      }

      if (instruct) {
        const absoluteInstructPath = resolve(process.cwd(), instruct);
        env['KRAKEN_INSTRUCT_PATH'] = absoluteInstructPath;
      }

      if (bundle) {
        const absoluteBundlePath = resolve(process.cwd(), bundle);
        env['KRAKEN_BUNDLE_PATH'] = absoluteBundlePath;
      } else if (url) {
        env['KRAKEN_BUNDLE_URL'] = url;
      } else if (source) {
        let t = temp.track();
        let tempdir = t.openSync({ suffix: '.js' });
        let tempPath = tempdir.path;
        fs.writeFileSync(tempPath, source, { encoding: 'utf-8' });
        env['KRAKEN_BUNDLE_PATH'] = tempPath;
      }

      if (fs.existsSync(shellPath)) {
        console.log(chalk.green('Execute binary:'), shellPath, '\n');
        let childProcess = spawn(shellPath, [], {
          stdio: 'pipe',
          env,
        });
        childProcess.stdout.pipe(process.stdout);
        childProcess.stderr.on('data', (data) => {
          let errlog = data.toString();
          errlog = errlog.split('\n').filter(line => line.indexOf('JavaScriptCore.framework') < 0);
          process.stderr.write(errlog.join('\n'));
        });
      } else {
        console.error(chalk.red('Kraken Binary NOT exists, try reinstall.'));
        process.exit(1);
      }
    }
  });



program.command('qjsc <source> [destination]')
  .requiredOption('--pluginName [pluginName]', 'the flutter plugin name')
  .option('--dart', 'export dart source file contains bytecode')
  .description('clone a repository into a newly created directory')
  .action((source, destination, command) => {
    const bundlePath = resolve(process.cwd(), source);
    destination = resolve(process.cwd(), destination);
    const code = fs.readFileSync(bundlePath, { encoding: 'utf-8' });
    const qjsc = new Qjsc();
    const buffer = qjsc.compile(code, 'plugin://');
    let output;
    if (command.dart) {
      output = exportDartCode(buffer, command.pluginName);
    } else {
      output = buffer;
    }
    fs.writeFileSync(destination, output);
    console.log('Bytecode generated at ' + destination);
  });

program.parse(process.argv);

function getShellPath(runtimeMode) {
  const platform = os.platform();
  const appPath = join(__dirname, '../build', platform);
  if (platform === 'darwin') {
    // Runtime mode = release/debug
    return join(appPath, runtimeMode, 'app.app/Contents/MacOS/app');
  } else if (platform === 'linux') {
    return join(appPath, 'kraken');
  } else {
    console.log(chalk.red(`[ERROR]: Platform ${platform} not supported by ${packageJSON.name}.`));
    process.exit(1);
  }
}
