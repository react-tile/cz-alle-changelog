import conventionalPrompt from 'cz-conventional-changelog/prompt';
import conventionalFormat from 'cz-conventional-changelog/format';

import shell from 'shelljs';
import path from 'path';
import fs from 'fs';

function getAllPackages () {
  const modulesPath = path.resolve('packages', 'node_modules');
  const modules = fs.readdirSync(modulesPath);

  return modules.map(function (moduleName) {
      const modulePath = path.join(modulesPath, moduleName);
      const modulePkg = JSON.parse(fs.readFileSync(path.join(modulePath, 'package.json'), 'utf8'));

      return {
          location: modulePath,
          name: modulePkg.name
      };
  });
}

function isStatusStaged (statusLine) {
  const modifiedAddedDeletedRenamedCopied = 'MADRC'; // see git status --help (short output format)
  const status = statusLine.split(' ');
  const stagedStatus = status[0];
  return modifiedAddedDeletedRenamedCopied.indexOf(stagedStatus) !== -1;
}

function isFileStaged (status, file) {
  const stagedChanges = status.split('\n').filter(isStatusStaged);
  return stagedChanges.some(function (stagedChange) {
    return stagedChange.indexOf(file) !== -1;
  });
}

function getChangedComponents () {
  let changedComponents = [];
  const status = shell.exec('git status . --short', {silent: true}).stdout;

  getAllPackages().forEach(function (pkg) {
    if (isFileStaged(status, path.relative('.', pkg.location))) {
      changedComponents.push(pkg.name);
    }
  });

  return changedComponents;
}

module.exports = {
  prompter: function(cz, options, commit) {
    if (typeof options === 'function') {
      commit = options;
      options = {};
    }

    console.log('\n' + conventionalFormat.help + '\n');

    const allPackages = getAllPackages().map((pkg) => pkg.name);

    conventionalPrompt(cz, options, (conventionalAnswers) => {
      const conventionalChangelogEntry = conventionalFormat.format(conventionalAnswers);

      cz.prompt({
        type: 'checkbox',
        name: 'packages',
        'default': getChangedComponents(),
        choices: allPackages,
        message: `The packages that this commit has affected (${getChangedComponents().length} detected)\n`,
        validate: function (input) {
          const type = conventionalAnswers.type;
          const isRequired = ['feat', 'fix'].indexOf(type) > -1;
          const isProvided = input.length > 0;
          return isRequired ? (isProvided ? true : `Commit type "${type}" must affect at least one component`) : true;
        }
      }).then(function (packageAnswers) {
        const messages = [
          conventionalChangelogEntry.head
        ];

        const selectedPackages = packageAnswers.packages;
        if (selectedPackages && selectedPackages.length) {
          messages.push('affects: ' + selectedPackages.join(', '));
        }

        messages.push(conventionalChangelogEntry.body);
        messages.push(conventionalChangelogEntry.footer);

        const commitMessage = messages.join('\n\n');

        console.log(commitMessage);

        commit(commitMessage);
      });
    });
  }
};
