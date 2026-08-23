package dev.platform.starter.observability;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@AutoConfiguration
@ConditionalOnProperty(prefix = "platform.observability", name = "enabled", havingValue = "true")
@EnableConfigurationProperties(PlatformObservabilityProperties.class)
public class PlatformObservabilityAutoConfiguration {
}
