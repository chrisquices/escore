<?php

use PhpCsFixer\Config;
use PhpCsFixer\Finder;
use Strata\PHPcsFixer\BlankLineAboveCommentsFixer;
use Strata\PHPcsFixer\MultilineQueryChainsFixer;

require_once __DIR__.'/fixers/BlankLineAboveCommentsFixer.php';
require_once __DIR__.'/fixers/MultilineQueryChainsFixer.php';

$projectDirectory = getcwd();

if ($projectDirectory === false) {
    throw new RuntimeException('Unable to determine the project directory.');
}

return (new Config)
    ->registerCustomFixers([new BlankLineAboveCommentsFixer, new MultilineQueryChainsFixer])
    ->setRules([
        'Strata/blank_line_above_comments' => true,
        'Strata/multiline_query_chains' => true,
    ])
    ->setUsingCache(false)
    ->setFinder(Finder::create()
        ->in($projectDirectory)
        ->exclude(['bootstrap/cache', 'build', 'node_modules', 'storage'])
        ->notName(['*.blade.php', '_ide_helper_actions.php', '_ide_helper_models.php', '_ide_helper.php', '.phpstorm.meta.php']));
