<?php

declare(strict_types=1);

use Rector\CodeQuality\Rector\Identical\SimplifyBoolIdenticalTrueRector;
use Rector\Config\RectorConfig;
use Rector\DowngradePhp74\Rector\ArrowFunction\ArrowFunctionToAnonymousFunctionRector;

$projectDirectory = getcwd();

if ($projectDirectory === false) {
    throw new RuntimeException('Unable to determine the project directory.');
}

return RectorConfig::configure()
    ->withoutParallel()
    ->withPaths([
        $projectDirectory.'/app',
        $projectDirectory.'/bootstrap/app.php',
        $projectDirectory.'/config',
        $projectDirectory.'/database',
        $projectDirectory.'/routes',
    ])
    ->withRules([
//        SimplifyBoolIdenticalTrueRector::class,
//        ArrowFunctionToAnonymousFunctionRector::class,
    ]);
