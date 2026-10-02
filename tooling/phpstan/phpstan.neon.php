<?php

use Strata\PHPStan\ControllerRules;
use Strata\PHPStan\EloquentRules;
use Strata\PHPStan\GeneralRules;
use Strata\PHPStan\ModelRules;
use Strata\PHPStan\RouteRules;
use Strata\PHPStan\ServiceRules;

require_once __DIR__.'/ControllerRules.php';
require_once __DIR__.'/ServiceRules.php';
require_once __DIR__.'/EloquentRules.php';
require_once __DIR__.'/GeneralRules.php';
require_once __DIR__.'/ModelRules.php';
require_once __DIR__.'/RouteRules.php';

return [
    'includes' => [
        '%currentWorkingDirectory%/vendor/larastan/larastan/extension.neon',
        '%currentWorkingDirectory%/vendor/nesbot/carbon/extension.neon',
        ...(is_file(getcwd().'/vendor/pestphp/pest-plugin-phpstan/extension.neon')
            ? ['%currentWorkingDirectory%/vendor/pestphp/pest-plugin-phpstan/extension.neon']
            : []),
    ],
    'rules' => [
        ControllerRules::class,
        ServiceRules::class,
        GeneralRules::class,
        ModelRules::class,
        RouteRules::class,
    ],
    'services' => [
        [
            'class' => EloquentRules::class,
            'arguments' => ['parser' => '@defaultAnalysisParser'],
            'tags' => ['phpstan.rules.rule'],
        ],
    ],
    'parameters' => [
        'parallel' => [
            // Run in the main process; even one worker requires a local socket.
            'maximumNumberOfProcesses' => 0,
        ],
        'paths' => [
            '%currentWorkingDirectory%/app/',
            '%currentWorkingDirectory%/bootstrap/app.php',
            '%currentWorkingDirectory%/database/',
            '%currentWorkingDirectory%/routes/',
            '%currentWorkingDirectory%/tests/',
        ],
        'level' => 7,
    ],
];
