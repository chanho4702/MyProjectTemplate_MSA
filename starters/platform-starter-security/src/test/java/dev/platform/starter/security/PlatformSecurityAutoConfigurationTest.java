package dev.platform.starter.security;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class PlatformSecurityAutoConfigurationTest {
    private final WebApplicationContextRunner contextRunner = new WebApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(
                    SecurityAutoConfiguration.class,
                    WebMvcAutoConfiguration.class,
                    PlatformSecurityAutoConfiguration.class
            ))
            .withBean(JwtDecoder.class, () -> mock(JwtDecoder.class));

    @Test
    void missingFlagUsesThePermitAllChain() {
        contextRunner.run(context -> {
            assertThat(context).hasBean("platformLocalPermitAllSecurityFilterChain");
            assertThat(context).doesNotHaveBean("platformSecurityFilterChain");
        });
    }

    @Test
    void enabledFlagUsesTheJwtChain() {
        contextRunner
                .withPropertyValues("platform.security.enabled=true")
                .run(context -> {
                    assertThat(context).hasBean("platformSecurityFilterChain");
                    assertThat(context).doesNotHaveBean("platformLocalPermitAllSecurityFilterChain");
                });
    }
}
