package dev.platform.starter.observability;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;

class PlatformObservabilityAutoConfigurationTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(PlatformObservabilityAutoConfiguration.class));

    @Test
    void propertiesAreRegisteredOnlyWhenExplicitlyEnabled() {
        contextRunner.run(context -> assertThat(context).doesNotHaveBean(PlatformObservabilityProperties.class));

        contextRunner
                .withPropertyValues("platform.observability.enabled=true")
                .run(context -> assertThat(context).hasSingleBean(PlatformObservabilityProperties.class));
    }

    @Test
    void missingFlagDisablesMetricsAndTraceExporters() {
        MockEnvironment environment = new MockEnvironment();

        new PlatformObservabilityEnvironmentPostProcessor()
                .postProcessEnvironment(environment, new SpringApplication());

        assertThat(environment.getPropertySources().get(PlatformObservabilityEnvironmentPostProcessor.PROPERTY_SOURCE_NAME))
                .isNotNull();
        assertThat(environment.getProperty("management.prometheus.metrics.export.enabled", Boolean.class)).isFalse();
        assertThat(environment.getProperty("management.otlp.tracing.export.enabled", Boolean.class)).isFalse();
        assertThat(environment.getProperty("management.tracing.enabled", Boolean.class)).isFalse();
    }

    @Test
    void enabledFlagLeavesNativeExporterSettingsUntouched() {
        MockEnvironment environment = new MockEnvironment()
                .withProperty("platform.observability.enabled", "true");

        new PlatformObservabilityEnvironmentPostProcessor()
                .postProcessEnvironment(environment, new SpringApplication());

        assertThat(environment.getPropertySources().get(PlatformObservabilityEnvironmentPostProcessor.PROPERTY_SOURCE_NAME))
                .isNull();
    }
}
