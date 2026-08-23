package dev.platform.starter.observability;

import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import io.micrometer.tracing.Tracer;
import io.opentelemetry.exporter.otlp.http.trace.OtlpHttpSpanExporter;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.ConfigurableApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;

class PlatformObservabilityStartupIntegrationTest {
    private static final String OTLP_TRACING_ENDPOINT =
            "--management.otlp.tracing.endpoint=http://collector.invalid:4318/v1/traces";

    @Test
    void disabledFlagTurnsOffExportersDuringRealStartup() {
        try (ConfigurableApplicationContext context = start(OTLP_TRACING_ENDPOINT)) {
            assertThat(context.getBeanNamesForType(PrometheusMeterRegistry.class)).isEmpty();
            // Boot still exposes a no-op-capable Tracer bean; the contract that
            // matters is that no span leaves the process: the OTLP span
            // exporter must be absent even though its endpoint is configured.
            assertThat(context.getBeanNamesForType(OtlpHttpSpanExporter.class)).isEmpty();
            assertThat(context.getEnvironment().getProperty("management.tracing.enabled", Boolean.class)).isFalse();
            assertThat(context.getEnvironment().getProperty("management.otlp.tracing.export.enabled", Boolean.class))
                    .isFalse();
            assertThat(context.getEnvironment().getProperty("management.prometheus.metrics.export.enabled", Boolean.class))
                    .isFalse();
        }
    }

    @Test
    void enabledFlagKeepsPrometheusOtlpAndTracingDuringRealStartup() {
        try (ConfigurableApplicationContext context = start(
                "--platform.observability.enabled=true",
                OTLP_TRACING_ENDPOINT)) {
            assertThat(context.getBeanNamesForType(PrometheusMeterRegistry.class)).isNotEmpty();
            assertThat(context.getBeanNamesForType(Tracer.class)).isNotEmpty();
            assertThat(context.getBeanNamesForType(OtlpHttpSpanExporter.class)).isNotEmpty();
        }
    }

    private ConfigurableApplicationContext start(String... args) {
        SpringApplication application = new SpringApplication(ObservabilityTestApplication.class);
        application.setWebApplicationType(WebApplicationType.NONE);
        return application.run(args);
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration
    static class ObservabilityTestApplication {
    }
}
