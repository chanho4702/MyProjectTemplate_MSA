package dev.platform.starter.security;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@AutoConfiguration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@EnableConfigurationProperties(PlatformSecurityProperties.class)
public class PlatformSecurityAutoConfiguration {
    @Bean
    @ConditionalOnMissingBean(SecurityFilterChain.class)
    @ConditionalOnProperty(prefix = "platform.security", name = "enabled", havingValue = "true")
    SecurityFilterChain platformSecurityFilterChain(
            HttpSecurity http,
            PlatformSecurityProperties properties
    ) throws Exception {
        String[] publicPaths = properties.getPublicPaths().toArray(String[]::new);
        http
                .csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(publicPaths).permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(resourceServer -> resourceServer.jwt(Customizer.withDefaults()));
        return http.build();
    }

    @Bean
    @ConditionalOnMissingBean(SecurityFilterChain.class)
    @ConditionalOnProperty(prefix = "platform.security", name = "enabled", havingValue = "false", matchIfMissing = true)
    SecurityFilterChain platformLocalPermitAllSecurityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll());
        return http.build();
    }
}
