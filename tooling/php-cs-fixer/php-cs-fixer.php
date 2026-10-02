<?php

use PhpCsFixer\Config;
use PhpCsFixer\Finder;
use Strata\PHPcsFixer\BlankLineAboveCommentsFixer;

require_once __DIR__.'/fixers/BlankLineAboveCommentsFixer.php';

$projectDirectory = getcwd();

if ($projectDirectory === false) {
    throw new RuntimeException('Unable to determine the project directory.');
}

return (new Config)
    ->registerCustomFixers([new BlankLineAboveCommentsFixer])
    ->setRules(['Strata/blank_line_above_comments' => true])
    ->setUsingCache(false)
    ->setFinder(Finder::create()
        ->in($projectDirectory)
        ->exclude(['bootstrap/cache', 'build', 'node_modules', 'storage'])
        ->notName(['*.blade.php', '_ide_helper_actions.php', '_ide_helper_models.php', '_ide_helper.php', '.phpstorm.meta.php']));
