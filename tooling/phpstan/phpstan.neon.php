<?php

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
    ],
    'rules' => [
        Escore\PHPStan\ControllerRules::class,
        Escore\PHPStan\ServiceRules::class,
        Escore\PHPStan\EloquentRules::class,
        Escore\PHPStan\GeneralRules::class,
        Escore\PHPStan\ModelRules::class,
        Escore\PHPStan\RouteRules::class,
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
