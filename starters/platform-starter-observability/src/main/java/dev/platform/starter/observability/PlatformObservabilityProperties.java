package dev.platform.starter.observability;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("platform.observability")
public class PlatformObservabilityProperties {
    private boolean enabled;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }
}
