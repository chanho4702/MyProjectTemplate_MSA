package dev.platform.starter.observability;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.config.ConfigDataEnvironmentPostProcessor;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.util.Map;

public final class PlatformObservabilityEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {
    static final String PROPERTY_SOURCE_NAME = "platformObservabilityDisabled";
    private static final Map<String, Object> DISABLED_EXPORTS = Map.of(
            "management.defaults.metrics.export.enabled", false,
            "management.prometheus.metrics.export.enabled", false,
            "management.otlp.metrics.export.enabled", false,
            "management.otlp.tracing.export.enabled", false,
            "management.otlp.logging.export.enabled", false,
            "management.tracing.enabled", false
    );

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        boolean enabled = environment.getProperty("platform.observability.enabled", Boolean.class, false);
        if (!enabled) {
            environment.getPropertySources().addFirst(new MapPropertySource(PROPERTY_SOURCE_NAME, DISABLED_EXPORTS));
        }
    }

    @Override
    public int getOrder() {
        return ConfigDataEnvironmentPostProcessor.ORDER + 1;
    }
}
