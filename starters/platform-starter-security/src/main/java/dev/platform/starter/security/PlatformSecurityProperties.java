package dev.platform.starter.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@ConfigurationProperties("platform.security")
public class PlatformSecurityProperties {
    private boolean enabled;
    private List<String> publicPaths = new ArrayList<>(List.of(
            "/actuator/health",
            "/actuator/health/**",
            "/actuator/info"
    ));

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public List<String> getPublicPaths() {
        return publicPaths;
    }

    public void setPublicPaths(List<String> publicPaths) {
        this.publicPaths = publicPaths;
    }
}
