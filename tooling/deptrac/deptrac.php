<?php

declare(strict_types=1);

use Deptrac\Deptrac\Contract\Config\Collector\DirectoryConfig;
use Deptrac\Deptrac\Contract\Config\DeptracConfig;
use Deptrac\Deptrac\Contract\Config\Layer;
use Deptrac\Deptrac\Contract\Config\Ruleset;
use Symfony\Component\DependencyInjection\Loader\Configurator\ContainerConfigurator;

return static function (DeptracConfig $config, ContainerConfigurator $container): void {
    $projectDirectory = getcwd();

    if ($projectDirectory === false) {
        throw new RuntimeException('Unable to determine the project directory.');
    }

    $container->parameters()->set('projectDirectory', $projectDirectory);

    $config
        ->paths('app', 'database/factories', 'database/seeders')
        ->layers(

            // Shared building blocks
            $enums = Layer::withName('Enums')->collectors(DirectoryConfig::create('app/Enums/.*')),
            $contracts = Layer::withName('Contracts')->collectors(DirectoryConfig::create('app/Contracts/.*')),
            $exceptions = Layer::withName('Exceptions')->collectors(DirectoryConfig::create('app/Exceptions/.*')),
            $concerns = Layer::withName('Concerns')->collectors(DirectoryConfig::create('app/Concerns/.*')),
            $helpers = Layer::withName('Helpers')->collectors(DirectoryConfig::create('app/Helpers/.*')),

            // Domain and data
            $casts = Layer::withName('Casts')->collectors(DirectoryConfig::create('app/Casts/.*')),
            $models = Layer::withName('Models')->collectors(DirectoryConfig::create('app/Models/.*')),

            // Application behavior
            $services = Layer::withName('Services')->collectors(DirectoryConfig::create('app/Services/.*')),
            $events = Layer::withName('Events')->collectors(DirectoryConfig::create('app/Events/.*')),
            $jobs = Layer::withName('Jobs')->collectors(DirectoryConfig::create('app/Jobs/.*')),
            $listeners = Layer::withName('Listeners')->collectors(DirectoryConfig::create('app/Listeners/.*')),
            $observers = Layer::withName('Observers')->collectors(DirectoryConfig::create('app/Observers/.*')),
            $policies = Layer::withName('Policies')->collectors(DirectoryConfig::create('app/Policies/.*')),

            // External integrations
            $integrations = Layer::withName('Integrations')->collectors(DirectoryConfig::create('app/Integrations/.*')),

            // HTTP interface
            $controllers = Layer::withName('Controllers')->collectors(DirectoryConfig::create('app/Http/Controllers/.*')),
            $requests = Layer::withName('Requests')->collectors(DirectoryConfig::create('app/Http/Requests/.*')),
            $resources = Layer::withName('Resources')->collectors(DirectoryConfig::create('app/Http/Resources/.*')),
            $middleware = Layer::withName('Middleware')->collectors(DirectoryConfig::create('app/Http/Middleware/.*')),
            $rules = Layer::withName('Rules')->collectors(DirectoryConfig::create('app/Rules/.*')),

            // Other application interfaces
            $console = Layer::withName('Console')->collectors(DirectoryConfig::create('app/Console/.*')),
            $broadcasting = Layer::withName('Broadcasting')->collectors(DirectoryConfig::create('app/Broadcasting/.*')),
            $mail = Layer::withName('Mail')->collectors(DirectoryConfig::create('app/Mail/.*')),
            $notifications = Layer::withName('Notifications')->collectors(DirectoryConfig::create('app/Notifications/.*')),

            // Framework bootstrapping
            $providers = Layer::withName('Providers')->collectors(DirectoryConfig::create('app/Providers/.*')),

            // Database support
            $factories = Layer::withName('Factories')->collectors(DirectoryConfig::create('database/factories/.*')),
            $seeders = Layer::withName('Seeders')->collectors(DirectoryConfig::create('database/seeders/.*')),
        )
        ->rulesets(

        // Shared building blocks
            Ruleset::forLayer($enums),
            Ruleset::forLayer($contracts),
            Ruleset::forLayer($exceptions),
            Ruleset::forLayer($concerns),
            Ruleset::forLayer($helpers),

            // Domain and data
            Ruleset::forLayer($casts),
            Ruleset::forLayer($models),

            // Application behavior
            Ruleset::forLayer($services)->accesses($helpers, $integrations, $models, $exceptions, $jobs),
            Ruleset::forLayer($events),
            Ruleset::forLayer($jobs)->accesses($services),
            Ruleset::forLayer($listeners),
            Ruleset::forLayer($observers),
            Ruleset::forLayer($policies)->accesses($models),

            // External integrations
            Ruleset::forLayer($integrations),

            // HTTP interface
            Ruleset::forLayer($controllers)->accesses($requests, $services, $helpers, $models, $resources),
            Ruleset::forLayer($requests)->accesses($helpers),
            Ruleset::forLayer($resources)->accesses($helpers),
            Ruleset::forLayer($middleware)->accesses($services, $resources),
            Ruleset::forLayer($rules),

            // Other application interfaces
            Ruleset::forLayer($console)->accesses($services),
            Ruleset::forLayer($broadcasting),
            Ruleset::forLayer($mail),
            Ruleset::forLayer($notifications),

            // Framework bootstrapping
            Ruleset::forLayer($providers)->accesses($services),

            // Database support
            Ruleset::forLayer($factories),
            Ruleset::forLayer($seeders)->accesses($models, $helpers, $services, $integrations, $factories), // TODO remove $services after removing polygon dependency
        );
};
